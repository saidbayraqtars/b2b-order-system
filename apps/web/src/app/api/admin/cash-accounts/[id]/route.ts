import { deleteCashAccount, updateCashAccount } from "@repo/services";
import { updateCashAccountSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, updateCashAccountSchema);
    await updateCashAccount(params.id, input);
    return new Response(null, { status: 204 });
  });
}

// An account with entries is never deleted — its ledger is the record of money
// that actually moved. The service refuses with CASH_ACCOUNT_IN_USE and asks
// for it to be closed instead.
export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    await deleteCashAccount(params.id);
    return new Response(null, { status: 204 });
  });
}
