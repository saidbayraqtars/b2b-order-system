import { runReportDefinition } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";

// GET /api/reports/definitions/:id/run — execute a saved report.
// The engine scopes rows by the CALLER, so a shared report shows a rep their
// own portfolio and an admin everything, from the same definition.
export function GET(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.view");
    return Response.json(
      await runReportDefinition(params.id, reportContext(user)),
    );
  });
}
