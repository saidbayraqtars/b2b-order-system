import type { NextRequest } from "next/server";
import { listProductPriceHistory } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

type Params = { params: { id: string } };

// GET /api/admin/products/:id/price-history — ürünün bütün varyantlarının fiyat
// değişiklikleri, en yenisi önce. Yalnız yönetimde (Said, 2026-10-05): alıcı
// eski fiyatı görmez.
export function GET(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.view");
    const history = await listProductPriceHistory(params.id);
    return Response.json({ history });
  });
}
