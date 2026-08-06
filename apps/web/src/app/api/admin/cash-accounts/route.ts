import { createCashAccount, listCashAccounts, listMethodBindings } from "@repo/services";
import { createCashAccountSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/cash-accounts — kasa/banka hesapları + yöntem eşlemesi.
// POST /api/admin/cash-accounts
//
// Super-admin only. These accounts are the company's own money, not a
// customer's: a firma yöneticisi has no business seeing the till, and a rep
// only ever touches it indirectly by recording a collection.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const [accounts, bindings] = await Promise.all([
      listCashAccounts(),
      listMethodBindings(),
    ]);
    return Response.json({ accounts, bindings });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createCashAccountSchema);
    const id = await createCashAccount(input);
    return Response.json({ id }, { status: 201 });
  });
}
