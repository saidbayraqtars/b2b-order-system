import { Prisma, prisma } from "@repo/database";
import type {
  CreateAddressInput,
  CreateCompanyInput,
  PaymentMethod,
  UpdateAddressInput,
  UpdateCompanyInput,
  VolumeDiscountMode,
} from "@repo/types";
import { auditActor, recordAudit, type AuditContext } from "./audit";
import { BusinessError } from "./errors";

// Company and address administration (SUPER_ADMIN). Customer groups live in
// pricing-admin.ts, next to the price tiers that use them.
//
// Deactivation, not deletion, is the rule for anything with history: a company
// with orders or ledger rows can never be removed without destroying the record
// those documents depend on.

export interface CompanyRow {
  id: string;
  name: string;
  taxNumber: string | null;
  phone: string | null;
  email: string | null;
  creditLimit: string;
  currentBalance: string;
  availableCredit: string;
  paymentTermDays: number;
  currency: string;
  requiresOrderApproval: boolean;
  isActive: boolean;
  customerGroup: { id: string; name: string } | null;
  salesRep: { id: string; name: string } | null;
  /** Empty = no restriction; every method is offered. See @repo/types. */
  allowedPaymentMethods: PaymentMethod[];
  /** The vade menu this customer picks from. Empty = default term applies. */
  paymentTerms: { id: string; name: string; days: number }[];
  /** AUTO earns the hacim rung from turnover; MANUAL uses `volumeTier` as-is. */
  volumeDiscountMode: VolumeDiscountMode;
  /**
   * The pinned rung. Meaningful only under MANUAL — under AUTO the rung in
   * force is whatever turnover earns, which `getVolumeStatus` answers live.
   */
  volumeTier: { id: string; name: string; discountPercent: string } | null;
  counts: { orders: number; users: number; addresses: number };
}

export interface CompanyDetail extends CompanyRow {
  taxOffice: string | null;
  addresses: AddressRow[];
  users: { id: string; name: string; email: string; role: string; isActive: boolean }[];
  createdAt: string;
}

export interface AddressRow {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  district: string | null;
  postalCode: string | null;
  isDefault: boolean;
  /** Ziyaret haritasının ve yol tarifinin okuduğu nokta. Girilmemiş olabilir. */
  latitude: number | null;
  longitude: number | null;
}

const companySelect = {
  id: true,
  name: true,
  taxNumber: true,
  taxOffice: true,
  phone: true,
  email: true,
  creditLimit: true,
  currentBalance: true,
  paymentTermDays: true,
  currency: true,
  requiresOrderApproval: true,
  isActive: true,
  createdAt: true,
  customerGroup: { select: { id: true, name: true } },
  salesRep: { select: { id: true, name: true } },
  allowedPaymentMethods: true,
  paymentTerms: {
    select: { id: true, name: true, days: true },
    orderBy: [{ sortOrder: "asc" }, { days: "asc" }],
  },
  volumeDiscountMode: true,
  volumeTier: { select: { id: true, name: true, discountPercent: true } },
  _count: { select: { orders: true, members: true, addresses: true } },
} satisfies Prisma.CompanySelect;

type CompanyPayload = Prisma.CompanyGetPayload<{ select: typeof companySelect }>;

function toRow(c: CompanyPayload): CompanyRow {
  return {
    id: c.id,
    name: c.name,
    taxNumber: c.taxNumber,
    phone: c.phone,
    email: c.email,
    creditLimit: c.creditLimit.toFixed(2),
    currentBalance: c.currentBalance.toFixed(2),
    availableCredit: c.creditLimit.minus(c.currentBalance).toFixed(2),
    paymentTermDays: c.paymentTermDays,
    currency: c.currency,
    requiresOrderApproval: c.requiresOrderApproval,
    isActive: c.isActive,
    customerGroup: c.customerGroup,
    salesRep: c.salesRep,
    allowedPaymentMethods: c.allowedPaymentMethods,
    paymentTerms: c.paymentTerms,
    volumeDiscountMode: c.volumeDiscountMode,
    volumeTier: c.volumeTier
      ? {
          id: c.volumeTier.id,
          name: c.volumeTier.name,
          discountPercent: c.volumeTier.discountPercent.toFixed(2),
        }
      : null,
    counts: {
      orders: c._count.orders,
      users: c._count.members,
      addresses: c._count.addresses,
    },
  };
}

export async function listCompanies(opts: {
  search?: string;
  includeInactive?: boolean;
} = {}): Promise<CompanyRow[]> {
  const rows = await prisma.company.findMany({
    where: {
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.search
        ? {
            OR: [
              { name: { contains: opts.search, mode: "insensitive" } },
              { taxNumber: { contains: opts.search } },
            ],
          }
        : {}),
    },
    select: companySelect,
    orderBy: { name: "asc" },
  });
  return rows.map(toRow);
}

export async function getCompany(id: string): Promise<CompanyDetail> {
  const c = await prisma.company.findUnique({
    where: { id },
    select: {
      ...companySelect,
      addresses: {
        select: {
          id: true,
          label: true,
          line1: true,
          line2: true,
          city: true,
          district: true,
          postalCode: true,
          isDefault: true,
          latitude: true,
          longitude: true,
        },
        orderBy: [{ isDefault: "desc" }, { label: "asc" }],
      },
      members: {
        select: { id: true, name: true, email: true, role: true, isActive: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!c) throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı", { id });

  return {
    ...toRow(c),
    taxOffice: c.taxOffice,
    addresses: c.addresses,
    users: c.members,
    createdAt: c.createdAt.toISOString(),
  };
}

async function assertReferences(input: {
  customerGroupId?: string | null;
  salesRepId?: string | null;
  paymentTermIds?: string[];
  volumeTierId?: string | null;
}): Promise<void> {
  if (input.volumeTierId) {
    const tier = await prisma.volumeTier.findUnique({
      where: { id: input.volumeTierId },
      select: { id: true },
    });
    if (!tier) {
      throw new BusinessError("VOLUME_TIER_NOT_FOUND", "Hacim basamağı bulunamadı");
    }
  }
  if (input.paymentTermIds && input.paymentTermIds.length > 0) {
    // Checked here rather than left to Prisma: `connect`/`set` on a missing row
    // raises P2025 with no indication of *which* id was wrong, and the admin
    // screen would show "kayıt bulunamadı" for a company that exists.
    const found = await prisma.paymentTerm.count({
      where: { id: { in: input.paymentTermIds } },
    });
    if (found !== new Set(input.paymentTermIds).size) {
      throw new BusinessError(
        "PAYMENT_TERM_NOT_FOUND",
        "Seçilen vade tanımlarından biri bulunamadı",
      );
    }
  }
  if (input.customerGroupId) {
    const group = await prisma.customerGroup.findUnique({
      where: { id: input.customerGroupId },
      select: { id: true },
    });
    if (!group) throw new BusinessError("GROUP_NOT_FOUND", "Müşteri grubu bulunamadı");
  }
  if (input.salesRepId) {
    // Only an actual sales rep may hold a portfolio; assigning a company user
    // here would quietly widen what that account can read.
    const rep = await prisma.user.findUnique({
      where: { id: input.salesRepId },
      select: { role: true },
    });
    if (!rep) throw new BusinessError("USER_NOT_FOUND", "Plasiyer bulunamadı");
    if (rep.role !== "SALES_REP" && rep.role !== "SUPER_ADMIN") {
      throw new BusinessError(
        "INVALID_ROLE",
        "Yalnızca plasiyer rolündeki kullanıcı firmaya atanabilir",
      );
    }
  }
}

async function assertTaxNumberFree(taxNumber: string, exceptId?: string): Promise<void> {
  const existing = await prisma.company.findUnique({
    where: { taxNumber },
    select: { id: true },
  });
  if (existing && existing.id !== exceptId) {
    throw new BusinessError("DUPLICATE_TAX_NUMBER", "Bu vergi numarası zaten kayıtlı");
  }
}

export async function createCompany(
  input: CreateCompanyInput,
  ctx?: AuditContext,
): Promise<CompanyRow> {
  await assertReferences(input);
  if (input.taxNumber) await assertTaxNumberFree(input.taxNumber);

  const created = await prisma.company.create({
    data: {
      name: input.name,
      taxNumber: input.taxNumber ?? null,
      taxOffice: input.taxOffice ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      creditLimit: input.creditLimit,
      paymentTermDays: input.paymentTermDays,
      currency: input.currency,
      requiresOrderApproval: input.requiresOrderApproval,
      isActive: input.isActive,
      customerGroupId: input.customerGroupId ?? null,
      salesRepId: input.salesRepId ?? null,
      allowedPaymentMethods: input.allowedPaymentMethods,
      volumeDiscountMode: input.volumeDiscountMode,
      volumeTierId: input.volumeTierId ?? null,
      ...(input.paymentTermIds.length > 0
        ? { paymentTerms: { connect: input.paymentTermIds.map((id) => ({ id })) } }
        : {}),
    },
    select: companySelect,
  });

  await logCompany(ctx, "COMPANY_CREATED", created.id, `Firma açıldı: ${created.name}`);
  return toRow(created);
}

export async function updateCompany(
  id: string,
  input: UpdateCompanyInput,
  ctx?: AuditContext,
): Promise<CompanyRow> {
  const existing = await prisma.company.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı", { id });

  await assertReferences(input);
  if (input.taxNumber) await assertTaxNumberFree(input.taxNumber, id);

  const updated = await prisma.company.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber ?? null } : {}),
      ...(input.taxOffice !== undefined ? { taxOffice: input.taxOffice ?? null } : {}),
      ...(input.email !== undefined ? { email: input.email ?? null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
      ...(input.paymentTermDays !== undefined
        ? { paymentTermDays: input.paymentTermDays }
        : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.requiresOrderApproval !== undefined
        ? { requiresOrderApproval: input.requiresOrderApproval }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.customerGroupId !== undefined
        ? { customerGroupId: input.customerGroupId }
        : {}),
      ...(input.salesRepId !== undefined ? { salesRepId: input.salesRepId } : {}),
      ...(input.allowedPaymentMethods !== undefined
        ? { allowedPaymentMethods: input.allowedPaymentMethods }
        : {}),
      // `set` and not `connect`: the screen sends the whole menu, so a term
      // removed there has to be removed here. `connect` would only ever add,
      // leaving a customer on a vade the admin thought they had taken away.
      ...(input.paymentTermIds !== undefined
        ? { paymentTerms: { set: input.paymentTermIds.map((id) => ({ id })) } }
        : {}),
      ...(input.volumeDiscountMode !== undefined
        ? { volumeDiscountMode: input.volumeDiscountMode }
        : {}),
      ...(input.volumeTierId !== undefined ? { volumeTierId: input.volumeTierId } : {}),
    },
    select: companySelect,
  });

  // Credit limit, payment term and approval requirement decide how much money a
  // customer can move without anyone signing off, so the changed field names go
  // into the trail even though the values stay out of the summary line.
  await logCompany(ctx, "COMPANY_UPDATED", id, `Firma güncellendi: ${updated.name}`, {
    fields: Object.keys(input),
  });
  return toRow(updated);
}

/**
 * Delete a company — refused as soon as anything depends on it. `currentBalance`
 * is checked too: a zero-order company can still carry an opening balance, and
 * dropping it would silently write off money.
 */
export async function deleteCompany(id: string, ctx?: AuditContext): Promise<void> {
  const c = await prisma.company.findUnique({
    where: { id },
    select: {
      name: true,
      currentBalance: true,
      _count: {
        select: { orders: true, transactions: true, members: true, checkIns: true },
      },
    },
  });
  if (!c) throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı", { id });

  const blockers = c._count;
  if (
    blockers.orders > 0 ||
    blockers.transactions > 0 ||
    blockers.members > 0 ||
    blockers.checkIns > 0 ||
    !c.currentBalance.isZero()
  ) {
    throw new BusinessError(
      "IN_USE",
      "Siparişi, cari hareketi, kullanıcısı veya bakiyesi olan firma silinemez — pasife alın",
      blockers,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.companyDiscount.deleteMany({ where: { companyId: id } });
    await tx.address.deleteMany({ where: { companyId: id } });
    await tx.company.delete({ where: { id } });
  });

  await logCompany(ctx, "COMPANY_DELETED", id, `Firma silindi: ${c.name}`);
}

/** Audit helper — a no-op when the caller did not pass an identity. */
async function logCompany(
  ctx: AuditContext | undefined,
  action: "COMPANY_CREATED" | "COMPANY_UPDATED" | "COMPANY_DELETED",
  id: string,
  summary: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  if (!ctx) return;
  await recordAudit({
    actor: auditActor(ctx),
    action,
    summary,
    entity: "Company",
    entityId: id,
    ip: ctx.meta?.ip,
    userAgent: ctx.meta?.userAgent,
    meta,
  });
}

// ─────────────────────────────────────────────
// ADDRESSES
// ─────────────────────────────────────────────

/** Exactly one default per company: promoting one demotes the rest. */
async function clearOtherDefaults(
  tx: Prisma.TransactionClient,
  companyId: string,
  exceptId?: string,
): Promise<void> {
  await tx.address.updateMany({
    where: { companyId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isDefault: false },
  });
}

export async function createAddress(
  companyId: string,
  input: CreateAddressInput,
): Promise<AddressRow> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { _count: { select: { addresses: true } } },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı", { companyId });
  }

  // The first address is the default whether or not the caller said so.
  const isDefault = input.isDefault || company._count.addresses === 0;

  return prisma.$transaction(async (tx) => {
    if (isDefault) await clearOtherDefaults(tx, companyId);
    return tx.address.create({
      data: {
        companyId,
        label: input.label,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        district: input.district ?? null,
        postalCode: input.postalCode ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        isDefault,
      },
      select: {
        id: true,
        label: true,
        line1: true,
        line2: true,
        city: true,
        district: true,
        postalCode: true,
        isDefault: true,
        latitude: true,
        longitude: true,
      },
    });
  });
}

export async function updateAddress(
  id: string,
  input: UpdateAddressInput,
): Promise<AddressRow> {
  const existing = await prisma.address.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!existing) throw new BusinessError("ADDRESS_NOT_FOUND", "Adres bulunamadı", { id });

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) await clearOtherDefaults(tx, existing.companyId, id);
    return tx.address.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
        ...(input.line2 !== undefined ? { line2: input.line2 ?? null } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.district !== undefined ? { district: input.district ?? null } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode ?? null } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      },
      select: {
        id: true,
        label: true,
        line1: true,
        line2: true,
        city: true,
        district: true,
        postalCode: true,
        isDefault: true,
        latitude: true,
        longitude: true,
      },
    });
  });
}

export async function deleteAddress(id: string): Promise<void> {
  const address = await prisma.address.findUnique({
    where: { id },
    select: { companyId: true, isDefault: true, _count: { select: { shippedOrders: true } } },
  });
  if (!address) throw new BusinessError("ADDRESS_NOT_FOUND", "Adres bulunamadı", { id });
  if (address._count.shippedOrders > 0) {
    throw new BusinessError(
      "IN_USE",
      "Bu adrese sevk edilmiş sipariş var, adres silinemez",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id } });
    // Never leave a company without a default while it still has addresses.
    if (address.isDefault) {
      const next = await tx.address.findFirst({
        where: { companyId: address.companyId },
        select: { id: true },
        orderBy: { label: "asc" },
      });
      if (next) {
        await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
  });
}
