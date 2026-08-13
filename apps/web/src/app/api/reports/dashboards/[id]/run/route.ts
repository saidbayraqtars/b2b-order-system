import { runDashboard } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";

// GET /api/reports/dashboards/:id/run — run every tile on the board.
// Each tile goes through the saved report's own ownership check and the
// CALLER's row scope, so a shared board shows a rep their own portfolio and
// silently drops nothing: a tile they may not open comes back as an error on
// that tile alone.
export function GET(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.view");
    return Response.json(await runDashboard(params.id, reportContext(user)));
  });
}
