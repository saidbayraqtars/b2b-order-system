import {
  deleteReportDefinition,
  getReportDefinition,
  updateReportDefinition,
} from "@repo/services";
import { updateReportDefinitionSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES);
    return Response.json({
      definition: await getReportDefinition(params.id, reportContext(user)),
    });
  });
}

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES);
    const input = await parseBody(req, updateReportDefinitionSchema);

    return Response.json(
      await updateReportDefinition(params.id, input, reportContext(user)),
    );
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES);
    await deleteReportDefinition(params.id, reportContext(user));
    return new Response(null, { status: 204 });
  });
}
