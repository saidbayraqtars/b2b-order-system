import {
  deleteDashboard,
  getDashboard,
  updateDashboard,
} from "@repo/services";
import { updateDashboardSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.build");
    return Response.json({
      dashboard: await getDashboard(params.id, reportContext(user)),
    });
  });
}

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.build");
    const input = await parseBody(req, updateDashboardSchema);

    return Response.json(
      await updateDashboard(params.id, input, reportContext(user)),
    );
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.build");
    await deleteDashboard(params.id, reportContext(user));
    return new Response(null, { status: 204 });
  });
}
