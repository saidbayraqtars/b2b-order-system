import { cancelShipment } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

type Params = { params: { id: string } };

// DELETE /api/shipments/:id — cancel a despatch recorded by mistake. The number
// it consumed is not returned to the pool.
export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "orders.fulfil");
    return Response.json(
      await cancelShipment(params.id, { userId: user.id, role: user.role }),
    );
  });
}
