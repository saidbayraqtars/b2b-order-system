import { prisma } from "@repo/database";
import type {
  CreateCompanyDiscountInput,
  CreateCustomerGroupInput,
  DiscountType,
  UpdateCustomerGroupInput,
  UpsertPriceInput,
} from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, round2 } from "./money";
import type { AdminPriceRow } from "./catalog-admin";

// Write side of the price resolution implemented in pricing.ts. A price row is
// identified by (variant, customer group, min quantity); writing the same triple
// twice updates the amount instead of failing, which is what a price-list edit
// screen actually means.

export interface CustomerGroupRow {
  id: string;
  name: string;
  description: string | null;
  companyCount: number;
  priceCount: number;
}

export async function listCustomerGroups(): Promise<CustomerGroupRow[]> {
  const rows = await prisma.customerGroup.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { companies: true, prices: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    companyCount: g._count.companies,
    priceCount: g._count.prices,
  }));
}

export async function listVariantPrices(
  variantId: string,
): Promise<AdminPriceRow[]> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true },
  });
  if (!variant) {
    throw new BusinessError("VARIANT_NOT_FOUND", "Varyant bulunamadı");
  }

  const rows = await prisma.price.findMany({
    where: { variantId },
    select: {
      id: true,
      customerGroupId: true,
      customerGroup: { select: { name: true } },
      minQuantity: true,
      price: true,
      currency: true,
    },
    orderBy: [{ customerGroupId: "asc" }, { minQuantity: "asc" }],
  });

  return rows.map((p) => ({
    id: p.id,
    customerGroupId: p.customerGroupId,
    customerGroupName: p.customerGroup?.name ?? null,
    minQuantity: p.minQuantity,
    price: p.price.toFixed(2),
    currency: p.currency,
  }));
}

/**
 * Create or update one price tier.
 *
 * The default tier (customerGroupId null) can't use Prisma's compound unique —
 * Postgres treats NULLs as distinct, so the schema covers it with a partial
 * unique index instead. That means the null case needs its own findFirst path
 * rather than an upsert on the compound key.
 */
async function assertGroupNameFree(name: string, exceptId?: string): Promise<void> {
  const existing = await prisma.customerGroup.findUnique({
    where: { name },
    select: { id: true },
  });
  if (existing && existing.id !== exceptId) {
    throw new BusinessError("DUPLICATE_GROUP", "Bu isimde bir müşteri grubu zaten var");
  }
}

export async function createCustomerGroup(
  input: CreateCustomerGroupInput,
): Promise<{ id: string }> {
  await assertGroupNameFree(input.name);
  return prisma.customerGroup.create({
    data: { name: input.name, description: input.description ?? null },
    select: { id: true },
  });
}

export async function updateCustomerGroup(
  id: string,
  input: UpdateCustomerGroupInput,
): Promise<{ id: string }> {
  const existing = await prisma.customerGroup.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new BusinessError("GROUP_NOT_FOUND", "Müşteri grubu bulunamadı");
  if (input.name) await assertGroupNameFree(input.name, id);

  return prisma.customerGroup.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description ?? null }
        : {}),
    },
    select: { id: true },
  });
}

/** A group with companies or price tiers still attached is never removed. */
export async function deleteCustomerGroup(id: string): Promise<void> {
  const group = await prisma.customerGroup.findUnique({
    where: { id },
    select: { _count: { select: { companies: true, prices: true } } },
  });
  if (!group) throw new BusinessError("GROUP_NOT_FOUND", "Müşteri grubu bulunamadı");
  if (group._count.companies > 0 || group._count.prices > 0) {
    throw new BusinessError(
      "IN_USE",
      "Firması veya fiyat kademesi olan müşteri grubu silinemez",
      group._count,
    );
  }
  await prisma.customerGroup.delete({ where: { id } });
}


export async function upsertPrice(variantId: string, input: UpsertPriceInput) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true },
  });
  if (!variant) {
    throw new BusinessError("VARIANT_NOT_FOUND", "Varyant bulunamadı");
  }

  const groupId = input.customerGroupId ?? null;
  if (groupId) {
    const group = await prisma.customerGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) {
      throw new BusinessError("GROUP_NOT_FOUND", "Müşteri grubu bulunamadı");
    }
  }

  const price = round2(new Dec(input.price));

  const existing = await prisma.price.findFirst({
    where: { variantId, customerGroupId: groupId, minQuantity: input.minQuantity },
    select: { id: true },
  });

  const row = existing
    ? await prisma.price.update({
        where: { id: existing.id },
        data: { price, currency: input.currency },
        select: { id: true, minQuantity: true, price: true, currency: true },
      })
    : await prisma.price.create({
        data: {
          variantId,
          customerGroupId: groupId,
          minQuantity: input.minQuantity,
          price,
          currency: input.currency,
        },
        select: { id: true, minQuantity: true, price: true, currency: true },
      });

  return {
    id: row.id,
    minQuantity: row.minQuantity,
    price: row.price.toFixed(2),
    currency: row.currency,
    created: !existing,
  };
}

export async function deletePrice(id: string): Promise<void> {
  const found = await prisma.price.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!found) throw new BusinessError("PRICE_NOT_FOUND", "Fiyat kaydı bulunamadı");
  await prisma.price.delete({ where: { id } });
}

// ─────────────────────────────────────────────
// COMPANY DISCOUNT
// ─────────────────────────────────────────────

export interface CompanyDiscountRow {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  productId: string | null;
  productName: string | null;
  discountType: DiscountType;
  value: string;
}

export async function listCompanyDiscounts(
  companyId: string,
): Promise<CompanyDiscountRow[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı");
  }

  const rows = await prisma.companyDiscount.findMany({
    where: { companyId },
    select: {
      id: true,
      categoryId: true,
      category: { select: { name: true } },
      productId: true,
      product: { select: { name: true } },
      discountType: true,
      value: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((d) => ({
    id: d.id,
    categoryId: d.categoryId,
    categoryName: d.category?.name ?? null,
    productId: d.productId,
    productName: d.product?.name ?? null,
    discountType: d.discountType,
    value: d.value.toFixed(2),
  }));
}

export async function createCompanyDiscount(
  companyId: string,
  input: CreateCompanyDiscountInput,
) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı");
  }

  // Zod already rejects "neither" and "both"; this guards non-HTTP callers.
  if (!input.categoryId && !input.productId) {
    throw new BusinessError(
      "INVALID_DISCOUNT_TARGET",
      "İskonto için kategori veya ürün seçilmeli",
    );
  }

  if (input.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new BusinessError("CATEGORY_NOT_FOUND", "Kategori bulunamadı");
    }
  }
  if (input.productId) {
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true },
    });
    if (!product) {
      throw new BusinessError("PRODUCT_NOT_FOUND", "Ürün bulunamadı");
    }
  }

  const row = await prisma.companyDiscount.create({
    data: {
      companyId,
      categoryId: input.categoryId ?? null,
      productId: input.productId ?? null,
      discountType: input.discountType,
      value: round2(new Dec(input.value)),
    },
    select: { id: true, discountType: true, value: true },
  });

  return {
    id: row.id,
    discountType: row.discountType,
    value: row.value.toFixed(2),
  };
}

export async function deleteCompanyDiscount(id: string): Promise<void> {
  const found = await prisma.companyDiscount.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!found) {
    throw new BusinessError("DISCOUNT_NOT_FOUND", "İskonto kaydı bulunamadı");
  }
  await prisma.companyDiscount.delete({ where: { id } });
}
