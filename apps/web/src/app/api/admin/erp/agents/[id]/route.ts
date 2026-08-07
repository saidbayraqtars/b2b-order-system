import { deleteErpAgent, setErpAgentActive } from "@repo/services";
import { updateErpAgentSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// PATCH — enable/disable. A disabled agent is refused on its very next request;
// there is no grace period, because disabling happens when something is wrong.
export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "erp.manage");
    const { isActive } = await parseBody(req, updateErpAgentSchema);
    await setErpAgentActive(params.id, isActive);
    return new Response(null, { status: 204 });
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "erp.manage");
    await deleteErpAgent(params.id);
    return new Response(null, { status: 204 });
  });
}
