import { deletePaymentTerm, updatePaymentTerm } from "@repo/services";
import { updatePaymentTermSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, updatePaymentTermSchema);

    return Response.json(await updatePaymentTerm(params.id, input));
  });
}

// A term customers are on cannot be deleted — the service refuses with
// PAYMENT_TERM_IN_USE and asks for it to be deactivated instead, so the orders
// sold on it stay explainable.
export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    await deletePaymentTerm(params.id);
    return new Response(null, { status: 204 });
  });
}
