import { listCashAccounts } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/cash-accounts — the picker a collection form needs.
//
// Separate from the admin endpoint and deliberately thinner: a rep has to say
// which drawer the money went into, but has no business reading the balances
// sitting in them. Only open accounts, only what fits in a <select>.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SALES_REP", "SUPER_ADMIN"], "cash.view");
    const accounts = await listCashAccounts(false);
    return Response.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        isDefault: a.isDefault,
      })),
    });
  });
}
