import { cancelPaymentIntent } from "@repo/services";
import { cancelPaymentIntentSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// POST /api/admin/payment-intents/:id/cancel — give up on a charge nobody took.
//
// A captured intent is refused here: money that moved has to be refunded, and
// marking it cancelled would lose the fact that it has to go back.
export function POST(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    const { reason } = await parseBody(req, cancelPaymentIntentSchema);
    await cancelPaymentIntent(params.id, reason, user.id);
    return new Response(null, { status: 204 });
  });
}
