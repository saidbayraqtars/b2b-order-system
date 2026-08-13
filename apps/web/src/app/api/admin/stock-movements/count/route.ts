import { recordStockCount } from "@repo/services";
import { stockCountSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// POST /api/admin/stock-movements/count — sayım. Gövde *sayılan adedi* taşır;
// farkı ve yönünü servis hesaplar, fark sıfırsa hareket yazılmaz.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "stock.manage");
    const input = await parseBody(req, stockCountSchema);
    return Response.json(await recordStockCount(input, user.id), { status: 201 });
  });
}
