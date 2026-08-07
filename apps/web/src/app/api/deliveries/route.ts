import type { NextRequest } from "next/server";
import { listCouriers, listDeliveries } from "@repo/services";
import { requireAnyPermission, withAuthErrors } from "@/lib/guard";

/**
 * GET /api/deliveries?delivered=1
 *
 * Kurye kendi işlerini görür. Sevkiyatı yöneten (orders.fulfil) hepsini görür
 * ve atanacak kurye listesini de alır — dağıtım ekranı ikisini birden gösterir.
 */
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireAnyPermission([
      "delivery.confirm",
      "orders.fulfil",
    ]);
    const { searchParams } = new URL(req.url);
    const includeDelivered = searchParams.get("delivered") === "1";

    const canDispatch = user.permissions.includes("orders.fulfil");

    if (!canDispatch) {
      return Response.json({
        deliveries: await listDeliveries({
          courierId: user.id,
          includeDelivered,
        }),
        couriers: [],
      });
    }

    const [deliveries, couriers] = await Promise.all([
      listDeliveries({ includeDelivered }),
      listCouriers(),
    ]);
    return Response.json({ deliveries, couriers });
  });
}
