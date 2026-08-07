import { createShipment, getOpenLines, listShipments } from "@repo/services";
import { createShipmentSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { assertOrderVisible } from "@/lib/order-access";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// GET  /api/orders/:id/shipments — despatches + what is still outstanding.
// POST /api/orders/:id/shipments — record a (possibly partial) despatch.
export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(undefined, "documents.view");
    await assertOrderVisible(user, params.id);

    const [shipments, openLines] = await Promise.all([
      listShipments(params.id),
      getOpenLines(params.id),
    ]);
    return Response.json({ shipments, openLines });
  });
}

export function POST(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "orders.fulfil");
    const input = await parseBody(req, createShipmentSchema);

    return Response.json(
      await createShipment(params.id, input, { userId: user.id, role: user.role }),
      { status: 201 },
    );
  });
}
