import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import type { ResetPasswordInput } from "@repo/types";
import { BusinessError } from "./errors";
import { recordAudit, type RequestMeta } from "./audit";
import { appUrl, sendMail } from "./mail";
import { passwordResetMail } from "./mail-templates";
import { evictPrincipal } from "./principal-cache";

// "Şifremi unuttum".
//
// Three things this flow must not do, and the code exists to prevent each:
//  1. Tell a stranger whether an e-mail is registered. Every request answers the
//     same way, and takes roughly the same time.
//  2. Leave a usable credential in the database. Only the SHA-256 of the token is
//     stored; the plaintext lives in the e-mail and nowhere else.
//  3. Let a stale link keep working. Tokens expire, are single-use, and asking
//     for a new one invalidates the ones outstanding.

const TOKEN_TTL_MINUTES = 60;
const BCRYPT_ROUNDS = 10;

/** How many links one account may be sent per window before we stop sending. */
const MAX_REQUESTS_PER_WINDOW = 3;
const WINDOW_MINUTES = 15;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Start a reset. Returns nothing on purpose — the caller always answers the
 * same, whether or not the address belongs to an account.
 */
export async function requestPasswordReset(
  email: string,
  meta: RequestMeta = {},
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  // Unknown or disabled: nothing to do, and nothing to say.
  if (!user || !user.isActive) return;

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_WINDOW) {
    // Someone is hammering the form, or a mail loop is retrying. Stop sending,
    // but keep the response identical.
    await recordAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "PASSWORD_RESET_REQUESTED",
      summary: "Şifre sıfırlama isteği hız sınırına takıldı",
      entity: "User",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { throttled: true, windowMinutes: WINDOW_MINUTES },
    });
    return;
  }

  // An older link must stop working the moment a new one is asked for.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
      requestedIp: meta.ip ?? null,
    },
  });

  const link = appUrl(`/sifremi-unuttum/yenile?token=${token}`);
  const result = await sendMail({
    to: user.email,
    ...passwordResetMail({ name: user.name, link, ttlMinutes: TOKEN_TTL_MINUTES }),
  });

  await recordAudit({
    actor: { id: user.id, email: user.email, role: user.role },
    action: result.ok ? "PASSWORD_RESET_REQUESTED" : "NOTIFICATION_FAILED",
    summary: result.ok
      ? "Şifre sıfırlama bağlantısı gönderildi"
      : "Şifre sıfırlama e-postası gönderilemedi",
    entity: "User",
    entityId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { transport: result.transport, error: result.error },
  });
}

/**
 * Finish a reset.
 *
 * Succeeding revokes every session the account had (tokenVersion bump) and
 * clears any login lockout: the person proving control of the mailbox is the
 * owner, and leaving them locked out would be absurd. The session doing the
 * reset was never authenticated in the first place, so there is nothing to keep.
 */
export async function completePasswordReset(
  input: ResetPasswordInput,
  meta: RequestMeta = {},
): Promise<void> {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { id: true, email: true, role: true, isActive: true } },
    },
  });

  // One message for every failure mode: expired, spent, forged, or belonging to
  // an account that has since been disabled.
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) {
    throw new BusinessError(
      "RESET_TOKEN_INVALID",
      "Bağlantı geçersiz ya da süresi dolmuş — yeniden talep edin",
    );
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: row.user.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
  ]);
  evictPrincipal(row.user.id);

  await recordAudit({
    actor: { id: row.user.id, email: row.user.email, role: row.user.role },
    action: "PASSWORD_RESET_COMPLETED",
    summary: "Şifre, sıfırlama bağlantısı ile değiştirildi",
    entity: "User",
    entityId: row.user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

/**
 * Housekeeping for expired/spent tickets. Not wired to a scheduler — there is no
 * job runner in this system yet — but exported so the admin retention screen and
 * any future cron can call the same code.
 */
export async function purgePasswordResetTokens(
  olderThan: Date = new Date(Date.now() - 7 * 24 * 60 * 60_000),
): Promise<number> {
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: olderThan } }, { usedAt: { lt: olderThan } }],
    },
  });
  return count;
}
