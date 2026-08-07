import { reverseCashMovement } from "@repo/services";
import { reverseCashMovementSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// POST /api/admin/cash-movements/:id/reverse — undo a hand-written entry with
// its opposite. Order and collection entries are refused by the service: those
// have a cari or an order on the other side, and are undone from there so both
// ledgers move together.
export function POST(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "cash.manage");
    const { reason } = await parseBody(req, reverseCashMovementSchema);
    return Response.json(
      await reverseCashMovement({ movementId: params.id, reason }, user.id),
    );
  });
}
