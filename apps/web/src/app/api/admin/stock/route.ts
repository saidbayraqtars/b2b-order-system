import { listStockLevels } from "@repo/services";
import { stockLevelFilterSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseQuery } from "@/lib/validate";

// GET /api/admin/stock — hangi üründe kaç adet var. Ekranın hem ana tablosu hem
// hareket girerken kullandığı ürün seçicisi: sayım girenin ilk sorusu zaten
// "defterde kaç yazıyor".
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "stock.view");
    const filter = parseQuery(req, stockLevelFilterSchema);
    return Response.json({ levels: await listStockLevels(filter) });
  });
}
