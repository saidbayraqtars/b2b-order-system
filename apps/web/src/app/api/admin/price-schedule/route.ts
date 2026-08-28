import type { NextRequest } from "next/server";
import { listScheduledPriceChanges } from "@repo/services";
import { PriceChangeStatusEnum } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/admin/price-schedule?status=PENDING — zamanlı fiyat kuyruğu.
//
// Kayıt **buradan açılmıyor**: satırlar Excel'in "Geçerlilik tarihi"
// sütunundan doğuyor. Bir zam listesini tek tek forma girmek, listeyi zaten
// Excel'de kuran kişiye yapılabilecek en kötü teklif.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "pricing.manage");
    const raw = new URL(req.url).searchParams.get("status");
    const parsed = PriceChangeStatusEnum.safeParse(raw);
    const changes = await listScheduledPriceChanges({
      status: parsed.success ? parsed.data : "PENDING",
    });
    return Response.json({ changes });
  });
}
