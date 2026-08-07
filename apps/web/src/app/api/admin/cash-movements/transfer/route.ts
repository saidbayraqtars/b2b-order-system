import { transferBetweenAccounts } from "@repo/services";
import { cashTransferSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// POST /api/admin/cash-movements/transfer — kasadan bankaya yatırma and the
// like. Writes both legs in one database transaction; neither exists alone.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "cash.manage");
    const input = await parseBody(req, cashTransferSchema);
    return Response.json(await transferBetweenAccounts(input, user.id), { status: 201 });
  });
}
