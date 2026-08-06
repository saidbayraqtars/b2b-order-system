import { setDefaultCashAccount } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

type Params = { params: { id: string } };

// POST /api/admin/cash-accounts/:id/default — make this the account unbound
// money falls into. Its own endpoint rather than a field on PATCH: setting it
// clears the flag on every other account, which is a different kind of write
// from renaming one.
export function POST(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    await setDefaultCashAccount(params.id);
    return new Response(null, { status: 204 });
  });
}
