import { prisma } from "@repo/database";
import bcrypt from "bcryptjs";
import {
  defaultPermissionsFor,
  isPermissionGrantableTo,
  outOfScopePermissions,
  ROLE_FAMILY,
  ROLE_FAMILY_LABELS,
  sanitizePermissions,
  type CreateUserInput,
  type Permission,
  type Role,
  type UpdateUserInput,
} from "@repo/types";
import { recordAudit, type RequestMeta } from "./audit";
import { BusinessError } from "./errors";
import { evictPrincipal } from "./principal-cache";

// User administration.
//
// Two callers, deliberately unequal:
//   SUPER_ADMIN   — anyone, any role.
//   COMPANY_ADMIN — only accounts inside their own company, and only the two
//                   company roles. They can delegate to a peer but can never
//                   mint a SUPER_ADMIN, create a SALES_REP, or move a user
//                   between companies.
//
// Every guard below exists because the alternative is privilege escalation or a
// locked-out system, so they are checked here rather than in the UI.

const BCRYPT_ROUNDS = 10;

/** Roles that belong to a company; the other two must have companyId null. */
const COMPANY_ROLES: readonly Role[] = ["COMPANY_ADMIN", "COMPANY_STAFF"];

export interface UserAdminContext {
  userId: string;
  email: string;
  role: Role;
  companyId: string | null;
  /**
   * Çağıranın *kendi* izin kümesi. Yetki devrinin üst sınırı: kimse
   * kendisinde olmayan bir izni başkasına veremez (bkz. assertMayGrant).
   */
  permissions: readonly Permission[];
  /** Client IP / user agent, recorded with every mutation. */
  meta?: RequestMeta;
}

/** The acting identity, as the audit trail records it. */
function actorOf(ctx: UserAdminContext) {
  return { id: ctx.userId, email: ctx.email, role: ctx.role };
}

/**
 * Changes that alter what a session is allowed to do. Any of them must kill the
 * target's existing sessions — otherwise a demoted or deactivated user keeps
 * their old privileges until their token expires.
 */
function privilegeChanged(
  input: UpdateUserInput,
  existing: { role: Role; isActive: boolean; companyId: string | null },
  nextCompanyId: string | null | undefined,
  permissionsChanged: boolean,
): boolean {
  if (input.role !== undefined && input.role !== existing.role) return true;
  if (input.isActive !== undefined && input.isActive !== existing.isActive) {
    return true;
  }
  if (nextCompanyId !== undefined && nextCompanyId !== existing.companyId) {
    return true;
  }
  // İzin kümesi artık yetkinin kendisi; kısıldığında eski oturumun yaşamaya
  // devam etmesi rol düşürmenin yaşamaya devam etmesinden farksız olurdu.
  return permissionsChanged;
}

/** Sıralı iki küme aynı mı — sanitize edilmiş listeler zaten sıralı geliyor. */
function samePermissions(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  /** Kayıtlı izin kümesi — düzenleme ekranındaki tiklerin kaynağı. */
  permissions: Permission[];
  company: { id: string; name: string } | null;
  /** Portfolio size, for sales reps. */
  managedCompanyCount: number;
  createdAt: string;
}

// passwordHash is absent from this select on purpose — it must not be able to
// leak through any code path that reuses it.
const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  isActive: true,
  permissions: true,
  createdAt: true,
  company: { select: { id: true, name: true } },
  _count: { select: { managedCompanies: true } },
} as const;

function toRow(u: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  permissions: string[];
  createdAt: Date;
  company: { id: string; name: string } | null;
  _count: { managedCompanies: number };
}): UserRow {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    permissions: sanitizePermissions(u.permissions),
    company: u.company,
    managedCompanyCount: u._count.managedCompanies,
    createdAt: u.createdAt.toISOString(),
  };
}

// ─────────────────────────────────────────────
// guards
// ─────────────────────────────────────────────

/** Which roles this caller may assign. */
function assignableRoles(ctx: UserAdminContext): readonly Role[] {
  if (ctx.role === "SUPER_ADMIN") {
    return ["SUPER_ADMIN", "COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP"];
  }
  return ["COMPANY_ADMIN", "COMPANY_STAFF"];
}

function assertMayAssign(ctx: UserAdminContext, role: Role): void {
  if (!assignableRoles(ctx).includes(role)) {
    throw new BusinessError(
      "FORBIDDEN",
      "Bu rolü atama yetkiniz yok",
      { role },
    );
  }
}

/**
 * Yetki devrinin iki sınırı.
 *
 * 1. **Kendinde olmayanı veremezsin.** Aksi hâlde kasaya erişimi olmayan bir
 *    firma yöneticisi kendine ikinci bir hesap açıp `cash.manage` verir ve rol
 *    ayrımı bir dakika içinde anlamsızlaşır. `users.manage` iznine sahip olmak
 *    "her yetkiyi dağıtabilirim" demek değil.
 *
 * 2. **Hesap tipinin dışına çıkamazsın.** Süper adminde her izin var, ama bir
 *    bayi personeline `organization.manage` ya da `orders.fulfil` vermek —
 *    yanlışlıkla bile — müşteriye satıcının ekranlarını ve uçlarını açar.
 *    Kapsam kayıt defterinde duruyor (`PERMISSION_SCOPE`), böylece ekranda
 *    pasif görünen kutu ile sunucunun reddettiği izin ayrışamaz.
 */
function assertMayGrant(
  ctx: UserAdminContext,
  requested: readonly Permission[],
  targetRole: Role,
): void {
  const own = new Set<Permission>(ctx.permissions);
  const excess = requested.filter((p) => !own.has(p));
  if (excess.length > 0) {
    throw new BusinessError(
      "FORBIDDEN",
      "Kendinizde olmayan yetkiyi veremezsiniz",
      { permissions: excess },
    );
  }

  const outOfScope = outOfScopePermissions(requested, targetRole);
  if (outOfScope.length > 0) {
    throw new BusinessError(
      "FORBIDDEN",
      `Bu yetkiler ${ROLE_FAMILY_LABELS[ROLE_FAMILY[targetRole]].toLowerCase()} hesabına verilemez`,
      { permissions: outOfScope, role: targetRole },
    );
  }
}

/**
 * Yetki kümesi değişirken kendini kilitlemeye karşı koruma.
 *
 * `users.manage`'i kendinden almak geri dönüşü olmayan tek hamle: onu
 * kaybeden kişi kendi yetkisini geri veremez, kimseye de veremez. Rol ve
 * pasife alma tarafında aynı korumanın (SELF_TARGET) izin tarafındaki karşılığı.
 */
function assertNotSelfLockout(
  ctx: UserAdminContext,
  targetId: string,
  next: readonly Permission[],
): void {
  if (targetId !== ctx.userId) return;
  if (!next.includes("users.manage")) {
    throw new BusinessError(
      "SELF_TARGET",
      "Kendi kullanıcı yönetimi yetkinizi kaldıramazsınız",
    );
  }
}

/** The company a new/edited user must belong to, given who is asking. */
function resolveCompanyId(
  ctx: UserAdminContext,
  role: Role,
  requested: string | null | undefined,
): string | null {
  if (COMPANY_ROLES.includes(role)) {
    if (ctx.role === "SUPER_ADMIN") {
      if (!requested) {
        throw new BusinessError(
          "INVALID_ROLE",
          "Firma yöneticisi ve personeli bir firmaya bağlı olmalı",
        );
      }
      return requested;
    }
    // A company admin may only ever act inside their own company; a requested
    // companyId that is not theirs is a move attempt, not a typo.
    if (!ctx.companyId) {
      throw new BusinessError("FORBIDDEN", "Hesabınıza firma atanmamış");
    }
    if (requested && requested !== ctx.companyId) {
      throw new BusinessError("FORBIDDEN", "Başka bir firmaya kullanıcı ekleyemezsiniz");
    }
    return ctx.companyId;
  }

  // SUPER_ADMIN / SALES_REP are system-level; a company binding here would be
  // misleading at best and a scope leak at worst.
  return null;
}

async function assertEmailFree(email: string, exceptId?: string): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing && existing.id !== exceptId) {
    throw new BusinessError("DUPLICATE_EMAIL", "Bu e-posta zaten kayıtlı");
  }
}

async function load(id: string, ctx: UserAdminContext) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { ...userSelect, companyId: true },
  });
  if (!user) throw new BusinessError("USER_NOT_FOUND", "Kullanıcı bulunamadı", { id });

  if (ctx.role !== "SUPER_ADMIN") {
    if (!ctx.companyId || user.companyId !== ctx.companyId) {
      throw new BusinessError("FORBIDDEN", "Bu kullanıcıya erişiminiz yok");
    }
    if (!COMPANY_ROLES.includes(user.role)) {
      throw new BusinessError("FORBIDDEN", "Bu kullanıcıyı yönetemezsiniz");
    }
  }
  return user;
}

/**
 * Refuse anything that would remove the last way into the system.
 * Checked before demoting, deactivating or deleting a super admin.
 */
async function assertNotLastSuperAdmin(userId: string): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (target?.role !== "SUPER_ADMIN" || !target.isActive) return;

  const others = await prisma.user.count({
    where: { role: "SUPER_ADMIN", isActive: true, id: { not: userId } },
  });
  if (others === 0) {
    throw new BusinessError(
      "LAST_SUPER_ADMIN",
      "Sistemdeki son aktif süper admin pasife alınamaz veya rolü değiştirilemez",
    );
  }
}

// ─────────────────────────────────────────────
// queries
// ─────────────────────────────────────────────

export async function listUsers(
  ctx: UserAdminContext,
  opts: { search?: string; companyId?: string; includeInactive?: boolean } = {},
): Promise<UserRow[]> {
  // A company admin's list is pinned to their own company regardless of filter.
  const scope =
    ctx.role === "SUPER_ADMIN"
      ? opts.companyId
        ? { companyId: opts.companyId }
        : {}
      : { companyId: ctx.companyId ?? "__none__", role: { in: [...COMPANY_ROLES] } };

  const rows = await prisma.user.findMany({
    where: {
      ...scope,
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.search
        ? {
            OR: [
              { name: { contains: opts.search, mode: "insensitive" as const } },
              { email: { contains: opts.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: userSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

export async function getUser(id: string, ctx: UserAdminContext): Promise<UserRow> {
  return toRow(await load(id, ctx));
}

/** Sales reps, for the company form's portfolio picker. */
export async function listSalesReps(): Promise<{ id: string; name: string }[]> {
  return prisma.user.findMany({
    where: { role: "SALES_REP", isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ─────────────────────────────────────────────
// mutations
// ─────────────────────────────────────────────

export async function createUser(
  input: CreateUserInput,
  ctx: UserAdminContext,
): Promise<UserRow> {
  assertMayAssign(ctx, input.role);
  // İzin verilmediyse rolün şablonu. "Rol seçtim, tik seçmedim" hâli boş yetkili
  // ve dolayısıyla işe yaramaz bir hesap üretmesin.
  const permissions = sanitizePermissions(
    input.permissions ?? defaultPermissionsFor(input.role),
  );
  assertMayGrant(ctx, permissions, input.role);
  const companyId = resolveCompanyId(ctx, input.role, input.companyId);
  await assertEmailFree(input.email);

  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı");
  }

  const created = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      phone: input.phone ?? null,
      role: input.role,
      isActive: input.isActive,
      permissions,
      companyId,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      passwordChangedAt: new Date(),
    },
    select: userSelect,
  });

  await recordAudit({
    actor: actorOf(ctx),
    action: "USER_CREATED",
    summary: `Kullanıcı oluşturuldu: ${created.email} (${created.role}, ${permissions.length} yetki)`,
    entity: "User",
    entityId: created.id,
    ip: ctx.meta?.ip,
    userAgent: ctx.meta?.userAgent,
    meta: { role: created.role, companyId, permissions },
  });

  return toRow(created);
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  ctx: UserAdminContext,
): Promise<UserRow> {
  const existing = await load(id, ctx);

  const nextRole = input.role ?? existing.role;
  if (input.role && input.role !== existing.role) {
    assertMayAssign(ctx, input.role);
    if (id === ctx.userId) {
      throw new BusinessError("SELF_TARGET", "Kendi rolünüzü değiştiremezsiniz");
    }
    await assertNotLastSuperAdmin(id);
  }

  if (input.isActive === false) {
    if (id === ctx.userId) {
      throw new BusinessError("SELF_TARGET", "Kendi hesabınızı pasife alamazsınız");
    }
    await assertNotLastSuperAdmin(id);
  }

  if (input.email && input.email !== existing.email) {
    await assertEmailFree(input.email, id);
  }

  // Yetki kümesi. Rol değişse bile tikler otomatik sıfırlanmıyor: rol şablonu
  // yalnızca formda ön-doldurma yapar, kaydedilen küme burada gelen listedir.
  // Böylece "plasiyer yaptım ama kasa yetkisi kalsın" gibi bilinçli ayarlar
  // sessizce geri alınmaz.
  let nextPermissions =
    input.permissions !== undefined
      ? sanitizePermissions(input.permissions)
      : undefined;

  // Tek istisna: rol *hesap tipini* değiştiriyorsa (satıcı → bayi gibi) eski
  // kümeyi olduğu gibi bırakmak, kapsam kuralını arka kapıdan delerdi — hesap
  // artık bayi ama üzerinde `organization.manage` duruyor olurdu. Bu durumda
  // yeni tipe verilemeyen izinler düşürülür ve denetim kaydına yazılır.
  if (nextPermissions === undefined && nextRole !== existing.role) {
    const kept = sanitizePermissions(existing.permissions).filter((p) =>
      isPermissionGrantableTo(p, nextRole),
    );
    if (kept.length !== existing.permissions.length) nextPermissions = kept;
  }

  if (nextPermissions) {
    assertMayGrant(ctx, nextPermissions, nextRole);
    assertNotSelfLockout(ctx, id, nextPermissions);
  }
  const permissionsChanged =
    nextPermissions !== undefined &&
    !samePermissions(existing.permissions, nextPermissions);

  // Recomputed whenever the role or the company changes, so the
  // role ⇄ companyId invariant can never drift.
  const companyChanged = input.companyId !== undefined;
  const roleChanged = input.role !== undefined && input.role !== existing.role;
  const companyId =
    companyChanged || roleChanged
      ? resolveCompanyId(
          ctx,
          nextRole,
          companyChanged ? input.companyId : existing.companyId,
        )
      : undefined;

  // Dropping a rep's portfolio silently would leave those companies unassigned
  // without anyone noticing, so it has to be deliberate.
  if (existing.role === "SALES_REP" && nextRole !== "SALES_REP") {
    const portfolio = await prisma.company.count({ where: { salesRepId: id } });
    if (portfolio > 0) {
      throw new BusinessError(
        "IN_USE",
        `Bu plasiyerin portföyünde ${portfolio} firma var — önce başka plasiyere devredin`,
        { portfolio },
      );
    }
  }

  // Role, company and activation decide what a session may do, so any of them
  // changing has to invalidate the sessions already issued to this account.
  const revoke = privilegeChanged(input, existing, companyId, permissionsChanged);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(nextPermissions !== undefined ? { permissions: nextPermissions } : {}),
      ...(companyId !== undefined ? { companyId } : {}),
      ...(revoke ? { tokenVersion: { increment: 1 } } : {}),
      // Re-enabling an account also clears whatever brute-force lock it carried.
      ...(input.isActive === true ? { failedLoginCount: 0, lockedUntil: null } : {}),
    },
    select: userSelect,
  });
  // Role, company and the active flag are read on every request through the
  // principal cache; drop the entry so the change is felt on the next one.
  evictPrincipal(id);

  const audit = {
    actor: actorOf(ctx),
    entity: "User",
    entityId: id,
    ip: ctx.meta?.ip,
    userAgent: ctx.meta?.userAgent,
  } as const;

  if (input.role !== undefined && input.role !== existing.role) {
    await recordAudit({
      ...audit,
      action: "USER_ROLE_CHANGED",
      summary: `${updated.email}: rol ${existing.role} → ${input.role}`,
      meta: { from: existing.role, to: input.role },
    });
  }
  if (input.isActive !== undefined && input.isActive !== existing.isActive) {
    await recordAudit({
      ...audit,
      action: input.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      summary: `${updated.email} ${input.isActive ? "aktifleştirildi" : "pasife alındı"}`,
    });
  }
  if (permissionsChanged) {
    // Eklenen/kaldırılan ayrı ayrı yazılıyor: "yetkiler değişti" satırı denetim
    // için işe yaramaz, kimin neyi ne zaman aldığı işe yarar.
    const before = new Set<string>(existing.permissions);
    const after = new Set<string>(nextPermissions!);
    const granted = nextPermissions!.filter((p) => !before.has(p));
    const revoked = existing.permissions.filter((p) => !after.has(p));
    await recordAudit({
      ...audit,
      action: "USER_PERMISSIONS_CHANGED",
      summary:
        `${updated.email}: ${granted.length} yetki verildi, ` +
        `${revoked.length} yetki kaldırıldı`,
      meta: { granted, revoked, result: nextPermissions },
    });
  }
  await recordAudit({
    ...audit,
    action: "USER_UPDATED",
    summary: `Kullanıcı güncellendi: ${updated.email}`,
    meta: {
      fields: Object.keys(input),
      sessionsRevoked: revoke,
    },
  });

  return toRow(updated);
}

/**
 * Administrator-set password. Revokes the target's sessions: whoever knew the
 * old password (including whoever the reset is protecting against) is signed
 * out immediately rather than at token expiry.
 */
export async function setUserPassword(
  id: string,
  password: string,
  ctx: UserAdminContext,
): Promise<void> {
  const target = await load(id, ctx);
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      passwordChangedAt: new Date(),
      tokenVersion: { increment: 1 },
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  evictPrincipal(id);

  await recordAudit({
    actor: actorOf(ctx),
    action: "PASSWORD_RESET",
    summary: `${target.email} için şifre sıfırlandı — oturumları sonlandırıldı`,
    entity: "User",
    entityId: id,
    ip: ctx.meta?.ip,
    userAgent: ctx.meta?.userAgent,
  });
}

/**
 * Delete a user. Refused once they have left a trace — orders, ledger entries,
 * visits, approvals and status changes all name their author, and losing that
 * would falsify the audit trail. Deactivate instead.
 */
export async function deleteUser(id: string, ctx: UserAdminContext): Promise<void> {
  const target = await load(id, ctx);
  if (id === ctx.userId) {
    throw new BusinessError("SELF_TARGET", "Kendi hesabınızı silemezsiniz");
  }
  await assertNotLastSuperAdmin(id);

  const counts = await prisma.user.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          ordersCreated: true,
          ordersApproved: true,
          checkIns: true,
          transactions: true,
          statusChanges: true,
          managedCompanies: true,
          reports: true,
        },
      },
    },
  });
  const c = counts!._count;
  const total =
    c.ordersCreated +
    c.ordersApproved +
    c.checkIns +
    c.transactions +
    c.statusChanges +
    c.managedCompanies;
  if (total > 0) {
    throw new BusinessError(
      "IN_USE",
      "Bu kullanıcının kayıtlı işlemleri var — silinemez, pasife alın",
      c,
    );
  }

  // Saved reports are the one thing that carries no audit weight.
  await prisma.$transaction(async (tx) => {
    await tx.reportDefinition.deleteMany({ where: { ownerId: id } });
    await tx.user.delete({ where: { id } });
  });
  evictPrincipal(id);

  // The deleted account's own log entries survive with actorId nulled out —
  // the denormalised e-mail on each row is what keeps them readable.
  await recordAudit({
    actor: actorOf(ctx),
    action: "USER_DELETED",
    summary: `Kullanıcı silindi: ${target.email} (${target.role})`,
    entity: "User",
    entityId: id,
    ip: ctx.meta?.ip,
    userAgent: ctx.meta?.userAgent,
    meta: { email: target.email, role: target.role },
  });
}
