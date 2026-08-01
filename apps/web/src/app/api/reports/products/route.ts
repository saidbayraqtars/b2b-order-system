import { getTopProducts } from "@repo/services";
import { reportQuerySchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { reportScopeFor } from "@/lib/report-scope";
import { parseQuery } from "@/lib/validate";

// GET /api/reports/products?from&to&companyId&limit — best sellers by revenue.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN", "SALES_REP"]);
    const query = parseQuery(req, reportQuerySchema);

    return Response.json(await getTopProducts(reportScopeFor(user, query)));
  });
}
