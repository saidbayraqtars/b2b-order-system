import { capturePaymentIntent } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

type Params = { params: { id: string } };

// POST /api/admin/payment-intents/:id/capture — the money is ours.
//
// With the manual provider this is an operator saying "I swiped it on the
// terminal"; with a real one it captures a held authorisation. Either way it is
// the only path that writes a card payment into the till, and the service makes
// it idempotent so a double-clicked button cannot book the amount twice.
export function POST(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    return Response.json(await capturePaymentIntent(params.id, user.id));
  });
}
