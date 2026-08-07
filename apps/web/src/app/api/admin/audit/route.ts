import { listAudit } from "@repo/services";
import { auditQuerySchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseQuery } from "@/lib/validate";

// GET /api/admin/audit — the security log.
//
// Super admin only. A company admin can already see who did what inside their
// own company through the records themselves; the trail also carries failed
// logins and denied requests across the whole system, which is not theirs.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "audit.view");
    const query = parseQuery(req, auditQuerySchema);
    return Response.json(await listAudit(query));
  });
}
