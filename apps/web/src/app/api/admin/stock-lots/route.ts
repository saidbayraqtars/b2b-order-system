import { getLotExpirySummary, listStockLots, recordLotEntry } from "@repo/services";
import { stockLotEntrySchema, stockLotFilterSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody, parseQuery } from "@/lib/validate";

// GET  /api/admin/stock-lots — parti listesi + SKT özeti, süzülebilir.
// POST /api/admin/stock-lots — mal kabul: partiyi aç/bul ve girişi defterle yaz.
//
// Özet listeyle aynı yanıtta dönüyor: uyarı şeridi ("3 parti bozulmuş, 11 parti
// 30 gün içinde") listenin üstünde duruyor ve iki ayrı istek, ekranın iki
// parçasının farklı anlara ait olması demek olurdu.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "stock.view");
    const filter = parseQuery(req, stockLotFilterSchema);
    const [lots, summary] = await Promise.all([
      listStockLots(filter),
      getLotExpirySummary(),
    ]);
    return Response.json({ lots, summary });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "stock.manage");
    const input = await parseBody(req, stockLotEntrySchema);
    return Response.json(await recordLotEntry(input, user.id), { status: 201 });
  });
}
