import { prisma } from "@repo/database";

// Per-address throttling for the login form.
//
// Account lockout alone leaves a gap: it counts failures per e-mail, so someone
// spraying one common password across a hundred addresses never trips it — each
// account sees a single failure. Counting per source address closes that,
// because the thing they cannot vary is where they are coming from.
//
// The counter is the audit log itself. A second table would be a second source
// of truth about the same events, free to drift from the one an auditor reads;
// AuditLog already records every failed login with its address, and there is an
// index for exactly this query.
//
// Two deliberate limits on what this can promise:
//  - `x-forwarded-for` is client-controlled unless a trusted proxy overwrites
//    it. So this raises the cost of spraying; it is not an access control, and
//    nothing here decides authorization.
//  - A request with no address at all is not throttled, because guessing an
//    identity for it would throttle everyone behind that guess together.

/** Failures from one address before it is turned away. */
export const MAX_FAILURES_PER_IP = 20;
export const IP_WINDOW_MINUTES = 15;
/** How long an address stays blocked once it is over the line. */
export const IP_BLOCK_MINUTES = 15;

export interface IpThrottleState {
  blocked: boolean;
  failures: number;
  /** When the block lifts, assuming no further attempts. */
  retryAt: Date | null;
}

/**
 * How the login endpoint should treat this address right now.
 *
 * Counts failures inside the window; being over the limit *is* the block, so
 * the address unblocks by itself as the old failures age out. There is no
 * separate block record to expire, and none to forget to clear.
 */
export async function checkIpThrottle(
  ip: string | null | undefined,
): Promise<IpThrottleState> {
  if (!ip) return { blocked: false, failures: 0, retryAt: null };

  const since = new Date(Date.now() - IP_WINDOW_MINUTES * 60_000);
  const failures = await prisma.auditLog.count({
    where: {
      ip,
      action: { in: ["LOGIN_FAILED", "LOGIN_LOCKED"] },
      createdAt: { gte: since },
    },
  });

  if (failures < MAX_FAILURES_PER_IP) {
    return { blocked: false, failures, retryAt: null };
  }

  // The oldest failure in the window decides when the count can fall below the
  // limit again, so the answer we give is the truth rather than a flat guess.
  const oldest = await prisma.auditLog.findFirst({
    where: {
      ip,
      action: { in: ["LOGIN_FAILED", "LOGIN_LOCKED"] },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const retryAt = new Date(
    (oldest?.createdAt.getTime() ?? Date.now()) + IP_BLOCK_MINUTES * 60_000,
  );
  return { blocked: true, failures, retryAt };
}
