import type { NextRequest } from "next/server";
import { assignCourier, confirmDelivery } from "@repo/services";
import { assignCourierSchema, confirmDeliverySchema } from "@repo/types";
import {
  InputError,
  requireAnyPermission,
  requireUser,
  withAuthErrors,
} from "@/lib/guard";

/**
 * PATCH /api/deliveries/:id — kurye ata / atamayı kaldır.
 *
 * Dağıtımı yapan kişinin işi (orders.fulfil). Kurye kendine iş atayamaz:
 * atama, kimin neyi taşıdığının kaydı ve o kaydı taşıyan kişi tutmamalı.
 */
export function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(undefined, "orders.fulfil");

    const json = await req.json().catch(() => null);
    const parsed = assignCourierSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const delivery = await assignCourier(params.id, parsed.data.courierId);
    return Response.json({ delivery });
  });
}

/**
 * POST /api/deliveries/:id — teslimi kaydet.
 *
 * Kuryenin kendi işi ya da sevkiyat yöneticisinin düzeltmesi. Servis, işin
 * gerçekten çağırana atanmış olduğunu ayrıca doğruluyor.
 */
export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireAnyPermission([
      "delivery.confirm",
      "orders.fulfil",
    ]);

    const json = await req.json().catch(() => null);
    const parsed = confirmDeliverySchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const delivery = await confirmDelivery({
      shipmentId: params.id,
      receivedByName: parsed.data.receivedByName,
      proofPhotoUrl: parsed.data.proofPhotoUrl ?? null,
      note: parsed.data.note ?? null,
      actorId: user.id,
      actorIsAdmin: user.permissions.includes("orders.fulfil"),
    });
    return Response.json({ delivery });
  });
}
