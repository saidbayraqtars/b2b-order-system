import { getSalesSummary } from "@repo/services";
import { reportQuerySchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { reportScopeFor } from "@/lib/report-scope";
import { parseQuery } from "@/lib/validate";

// GET /api/reports/sales?from&to&companyId&limit — booked revenue, daily series,
// pending/lost totals and the top customers of the window.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN", "SALES_REP"]);
    const query = parseQuery(req, reportQuerySchema);

    return Response.json(await getSalesSummary(reportScopeFor(user, query)));
  });
}
