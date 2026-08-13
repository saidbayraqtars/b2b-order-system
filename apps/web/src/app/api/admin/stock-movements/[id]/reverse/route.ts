import { reverseStockMovement } from "@repo/services";
import { reverseStockMovementSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// POST /api/admin/stock-movements/:id/reverse — elle yazılmış bir hareketi
// tersiyle geri al. Sipariş kaynaklı hareketler servis tarafından reddedilir:
// onların öbür yarısı siparişin kendisi ve oradan iptal edilir.
export function POST(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "stock.manage");
    const { reason } = await parseBody(req, reverseStockMovementSchema);
    return Response.json(
      await reverseStockMovement({ movementId: params.id, reason }, user.id),
    );
  });
}
