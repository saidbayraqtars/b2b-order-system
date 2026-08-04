import { deleteDocumentSeries, updateDocumentSeries } from "@repo/services";
import { updateDocumentSeriesSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, updateDocumentSeriesSchema);

    return Response.json(await updateDocumentSeries(params.id, input));
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    await deleteDocumentSeries(params.id);
    return new Response(null, { status: 204 });
  });
}
