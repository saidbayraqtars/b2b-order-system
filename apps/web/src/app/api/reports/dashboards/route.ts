import { createDashboard, listDashboards } from "@repo/services";
import { createDashboardSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { parseBody } from "@/lib/validate";

// GET  /api/reports/dashboards — the caller's own boards plus shared ones.
// POST /api/reports/dashboards — save a new one.
export function GET() {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.build");
    return Response.json({
      dashboards: await listDashboards(reportContext(user)),
    });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.build");
    const input = await parseBody(req, createDashboardSchema);

    const created = await createDashboard(input, reportContext(user));
    return Response.json(created, { status: 201 });
  });
}
