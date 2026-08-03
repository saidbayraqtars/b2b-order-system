import { deleteAddress, updateAddress } from "@repo/services";
import { updateAddressSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, updateAddressSchema);

    return Response.json({ address: await updateAddress(params.id, input) });
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    await deleteAddress(params.id);
    return new Response(null, { status: 204 });
  });
}
