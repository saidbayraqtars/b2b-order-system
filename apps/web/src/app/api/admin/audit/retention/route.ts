import { z } from "zod";
import { auditStats, purgeAuditLogs, DEFAULT_RETENTION_DAYS } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/audit/retention — what the trail currently holds.
// POST /api/admin/audit/retention — delete entries older than the cutoff.
//
// Deleting audit entries is the one write that breaks the append-only rule, so
// it is super-admin only, it takes an explicit cutoff rather than running on a
// schedule nobody watches, and the deletion is itself recorded.

export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    return Response.json(await auditStats());
  });
}

const purgeSchema = z.object({
  /** Days to keep. Anything older goes. */
  retentionDays: z.number().int().min(30).max(3650).default(DEFAULT_RETENTION_DAYS),
  /** Keep security events longer than the rest. */
  keepSecurityActions: z.boolean().default(true),
});

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, purgeSchema);

    const before = new Date(Date.now() - input.retentionDays * 24 * 60 * 60_000);
    const result = await purgeAuditLogs({
      before,
      keepActions: input.keepSecurityActions
        ? (["LOGIN_FAILED", "LOGIN_LOCKED", "SESSION_REVOKED", "ACCESS_DENIED", "USER_ROLE_CHANGED", "USER_DELETED", "PASSWORD_RESET", "PASSWORD_RESET_COMPLETED"] as const)
        : undefined,
      actor: { id: user.id, email: user.email, role: user.role },
    });

    return Response.json({ ...result, before: before.toISOString() });
  });
}
