import { getCollections } from "@repo/services";
import { reportQuerySchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { reportScopeFor } from "@/lib/report-scope";
import { parseQuery } from "@/lib/validate";

// GET /api/reports/collections?from&to&companyId&limit — tahsilat report.
// For a SALES_REP the scope means "collections I recorded"; for a super admin
// it is every collection, optionally filtered by rep or company.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN", "SALES_REP"]);
    const query = parseQuery(req, reportQuerySchema);

    return Response.json(await getCollections(reportScopeFor(user, query)));
  });
}
