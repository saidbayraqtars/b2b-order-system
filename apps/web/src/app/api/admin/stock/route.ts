import { listStockLevels, setWarehouseStockSettings } from "@repo/services";
import {
  stockLevelFilterSchema,
  warehouseStockSettingsSchema,
} from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody, parseQuery } from "@/lib/validate";

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

// PATCH /api/admin/stock — bir kalemin bir depodaki ayarı: kritik seviye ve
// "sipariş alınmasın". Miktar buradan değişmez; o yalnızca defterden.
export function PATCH(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "stock.manage");
    const input = await parseBody(req, warehouseStockSettingsSchema);
    return Response.json(await setWarehouseStockSettings(input));
  });
}
