import { prisma } from "@repo/database";
import bcrypt from "bcryptjs";
import type {
  ChangePasswordInput,
  Role,
  UpdateProfileInput,
} from "@repo/types";
import { recordAudit, type RequestMeta } from "./audit";
import { BusinessError } from "./errors";
import { evictPrincipal } from "./principal-cache";

// Self-service account management: what a user may do to their own account
// without an administrator. Everything here is scoped by userId taken from the
// verified session — no function accepts a target id from the request body,
// which is what keeps "change my password" from becoming "change theirs".

const BCRYPT_ROUNDS = 10;

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  company: { id: string; name: string } | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
}

const profileSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  lastLoginAt: true,
  lastLoginIp: true,
  passwordChangedAt: true,
  createdAt: true,
  company: { select: { id: true, name: true } },
} as const;

function toProfile(u: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
  company: { id: string; name: string } | null;
}): AccountProfile {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    company: u.company,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lastLoginIp: u.lastLoginIp,
    passwordChangedAt: u.passwordChangedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function getAccount(userId: string): Promise<AccountProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
  if (!user) throw new BusinessError("USER_NOT_FOUND", "Hesap bulunamadı");
  return toProfile(user);
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  meta: RequestMeta = {},
): Promise<AccountProfile> {
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, phone: true, email: true, role: true },
  });
  if (!before) throw new BusinessError("USER_NOT_FOUND", "Hesap bulunamadı");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: input.name, phone: input.phone ?? null },
    select: profileSelect,
  });
  // After the write, never before: evicting first would let a concurrent read
  // repopulate the cache from the row this update is about to replace.
  evictPrincipal(userId);

  await recordAudit({
    actor: { id: userId, email: before.email, role: before.role },
    action: "PROFILE_UPDATED",
    summary: "Kendi profilini güncelledi",
    entity: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: {
      before: { name: before.name, phone: before.phone },
      after: { name: updated.name, phone: updated.phone },
    },
  });

  return toProfile(updated);
}

/**
 * Change your own password.
 *
 * The current password is required: an unattended open session must not be
 * enough to lock the real owner out. On success every session is revoked
 * (tokenVersion bump) — including the one making this request, which is the
 * point: if the password changed because it leaked, the thief's session dies
 * with it. The caller is expected to send the user back to the login screen.
 */
export async function changeOwnPassword(
  userId: string,
  input: ChangePasswordInput,
  meta: RequestMeta = {},
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, passwordHash: true },
  });
  if (!user) throw new BusinessError("USER_NOT_FOUND", "Hesap bulunamadı");

  const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!ok) {
    await recordAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "LOGIN_FAILED",
      summary: "Şifre değiştirmede mevcut şifre hatalı girildi",
      entity: "User",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { reason: "WRONG_CURRENT_PASSWORD" },
    });
    throw new BusinessError("INVALID_PASSWORD", "Mevcut şifre hatalı");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS),
      passwordChangedAt: new Date(),
      tokenVersion: { increment: 1 },
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  evictPrincipal(userId);

  await recordAudit({
    actor: { id: user.id, email: user.email, role: user.role },
    action: "PASSWORD_CHANGED",
    summary: "Kendi şifresini değiştirdi — tüm oturumlar sonlandırıldı",
    entity: "User",
    entityId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
