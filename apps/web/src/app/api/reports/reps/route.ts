import { getRepPerformance } from "@repo/services";
import { reportQuerySchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseQuery } from "@/lib/validate";

// GET /api/reports/reps?from&to — per-rep sales, collections and visit counts.
// Super admin only: it compares reps against each other.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "reports.view");
    const query = parseQuery(req, reportQuerySchema);

    return Response.json(await getRepPerformance(query));
  });
}
