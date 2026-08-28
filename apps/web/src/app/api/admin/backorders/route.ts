import { getBackorders } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/admin/backorders — sevk edilmemiş bakiye.
//
// `orders.fulfil` izni: soru "ne sevk edilecek" ve cevabı sevkiyatı yapan
// kişiye ait. Salt okunur; buradan hiçbir şey sevk edilmiyor.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "orders.fulfil");
    return Response.json({ report: await getBackorders() });
  });
}
