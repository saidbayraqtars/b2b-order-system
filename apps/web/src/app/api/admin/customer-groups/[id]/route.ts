import { deleteCustomerGroup, updateCustomerGroup } from "@repo/services";
import { updateCustomerGroupSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "groups.manage");
    const input = await parseBody(req, updateCustomerGroupSchema);

    return Response.json(await updateCustomerGroup(params.id, input));
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "groups.manage");
    await deleteCustomerGroup(params.id);
    return new Response(null, { status: 204 });
  });
}
