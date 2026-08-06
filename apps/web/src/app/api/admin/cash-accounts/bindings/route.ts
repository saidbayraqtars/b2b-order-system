import { setMethodBinding } from "@repo/services";
import { setMethodBindingSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// PUT /api/admin/cash-accounts/bindings — which account a payment method's
// money lands in. One method per call; a null account clears the binding and
// sends that method back to the default till.
export function PUT(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, setMethodBindingSchema);
    await setMethodBinding(input.method, input.accountId);
    return new Response(null, { status: 204 });
  });
}
