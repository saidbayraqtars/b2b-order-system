import { prisma } from "@repo/database";
import bcrypt from "bcryptjs";
import type { Role, SessionUser } from "@repo/types";
import { recordAudit, type RequestMeta } from "./audit";
import { checkIpThrottle } from "./rate-limit";
import {
  evictPrincipal,
  getCachedPrincipal,
  setCachedPrincipal,
} from "./principal-cache";

// Login attempt handling and live principal lookup.
//
// The two halves belong together: `attemptLogin` decides who gets a session,
// `loadPrincipal` decides whether an already-issued one is still worth
// anything. Both are the only places that read `passwordHash` / `tokenVersion`.

/** Consecutive failures before the account is locked. */
export const MAX_FAILED_LOGINS = 5;
/** How long a lock lasts. Short enough to be a brake, not a denial-of-service. */
export const LOCKOUT_MINUTES = 15;


// ─────────────────────────────────────────────
// live principal
// ─────────────────────────────────────────────

export interface Principal extends SessionUser {
  tokenVersion: number;
  isActive: boolean;
}

/**
 * Read the account as it exists *now*.
 *
 * Every authenticated request goes through this rather than trusting the role
 * and companyId baked into the session token. A session is proof of a past
 * login, not of present authority: between issuing it and using it the account
 * may have been demoted, moved to another company, deactivated or deleted.
 */
export async function loadPrincipal(userId: string): Promise<Principal | null> {
  // Seconds-long cache. It stores the row, never a verdict — checkPrincipal
  // still decides on every request, and every write that changes what an
  // account may do evicts the entry first. See principal-cache.ts.
  const cached = getCachedPrincipal(userId);
  if (cached !== undefined) return cached;

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      isActive: true,
      tokenVersion: true,
    },
  });
  setCachedPrincipal(userId, row ?? null);
  return row ?? null;
}

export type PrincipalRejection = "UNKNOWN" | "DISABLED" | "STALE";

export interface PrincipalCheck {
  user: Principal | null;
  rejection: PrincipalRejection | null;
}

/**
 * Validate a session claim against the live account.
 * `claimedVersion` is the tokenVersion the session was minted with; a mismatch
 * means privileges or the password changed since, so the session is dead.
 */
export async function checkPrincipal(
  userId: string,
  claimedVersion: number | null | undefined,
): Promise<PrincipalCheck> {
  const user = await loadPrincipal(userId);
  if (!user) return { user: null, rejection: "UNKNOWN" };
  if (!user.isActive) return { user, rejection: "DISABLED" };
  // A token minted before tokenVersion existed carries no version claim; treat
  // it as version 0, which is what every pre-existing account starts at.
  if ((claimedVersion ?? 0) !== user.tokenVersion) {
    return { user, rejection: "STALE" };
  }
  return { user, rejection: null };
}

/** Invalidate every session of a user. Callers pass a reason for the log. */
export async function revokeSessions(userId: string): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  // Before returning, so the very next request re-reads the account. Without
  // this the revocation would only bite once the cache entry expired.
  evictPrincipal(userId);
  return updated.tokenVersion;
}

// ─────────────────────────────────────────────
// login
// ─────────────────────────────────────────────

export type LoginFailure = "INVALID" | "DISABLED" | "LOCKED" | "IP_BLOCKED";

export type LoginResult =
  | { ok: true; user: SessionUser; tokenVersion: number }
  | { ok: false; reason: LoginFailure; lockedUntil?: Date };

/**
 * Verify credentials and maintain the failure counter.
 *
 * Deliberate asymmetry in what the caller may reveal:
 *   INVALID / DISABLED → one generic message, so an attacker cannot use the
 *     login form to find out which e-mails are registered.
 *   LOCKED → says so, with the expiry. A legitimate user who is locked out
 *     needs to know that waiting fixes it; and by then the attacker already
 *     knows the address exists, because only a real account can lock.
 */
export async function attemptLogin(
  email: string,
  password: string,
  meta: RequestMeta = {},
): Promise<LoginResult> {
  // Before anything else, and before touching a password: account lockout counts
  // per e-mail, so one common password sprayed across a hundred addresses never
  // trips it. The source address is the thing an attacker cannot vary cheaply.
  const throttle = await checkIpThrottle(meta.ip);
  if (throttle.blocked) {
    await recordAudit({
      actor: { id: null, email, role: null },
      action: "LOGIN_LOCKED",
      summary: `Adres hız sınırına takıldı (${throttle.failures} başarısız deneme)`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: {
        channel: meta.channel ?? "web",
        reason: "IP_THROTTLED",
        retryAt: throttle.retryAt,
      },
    });
    return { ok: false, reason: "IP_BLOCKED", lockedUntil: throttle.retryAt ?? undefined };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await recordAudit({
      actor: { id: null, email, role: null },
      action: "LOGIN_FAILED",
      summary: `Kayıtlı olmayan e-posta ile giriş denemesi: ${email}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { channel: meta.channel ?? "web", reason: "UNKNOWN_EMAIL" },
    });
    // Spend roughly the same time as a real comparison would, so response time
    // does not answer "is this address registered?".
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false, reason: "INVALID" };
  }

  const actor = { id: user.id, email: user.email, role: user.role as Role };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAudit({
      actor,
      action: "LOGIN_LOCKED",
      summary: "Kilitli hesaba giriş denemesi",
      entity: "User",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { channel: meta.channel ?? "web", lockedUntil: user.lockedUntil },
    });
    return { ok: false, reason: "LOCKED", lockedUntil: user.lockedUntil };
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);

  if (!passwordOk) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    const lockedUntil = lock
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
      : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        ...(lockedUntil ? { lockedUntil } : {}),
      },
    });

    await recordAudit({
      actor,
      action: lock ? "LOGIN_LOCKED" : "LOGIN_FAILED",
      summary: lock
        ? `${MAX_FAILED_LOGINS} başarısız denemeden sonra hesap ${LOCKOUT_MINUTES} dakika kilitlendi`
        : `Hatalı şifre (${failed}/${MAX_FAILED_LOGINS})`,
      entity: "User",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { channel: meta.channel ?? "web", attempt: failed },
    });

    return lockedUntil
      ? { ok: false, reason: "LOCKED", lockedUntil }
      : { ok: false, reason: "INVALID" };
  }

  // Password is right — but a deactivated account still may not in. Checked
  // after the comparison so the timing is identical to a normal login.
  if (!user.isActive) {
    await recordAudit({
      actor,
      action: "LOGIN_FAILED",
      summary: "Pasif hesapla giriş denemesi",
      entity: "User",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { channel: meta.channel ?? "web", reason: "DISABLED" },
    });
    return { ok: false, reason: "DISABLED" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: meta.ip ?? null,
    },
  });

  await recordAudit({
    actor,
    action: "LOGIN_SUCCESS",
    summary: `Giriş yapıldı (${meta.channel ?? "web"})`,
    entity: "User",
    entityId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { channel: meta.channel ?? "web" },
  });

  return {
    ok: true,
    tokenVersion: user.tokenVersion,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    },
  };
}

// A real bcrypt hash of a value nothing can match, used only to burn the same
// CPU time as a genuine comparison when the e-mail is unknown.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
