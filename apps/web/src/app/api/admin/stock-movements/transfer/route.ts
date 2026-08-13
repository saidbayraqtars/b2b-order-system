import { transferStock } from "@repo/services";
import { stockTransferSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// POST /api/admin/stock-movements/transfer — depodan depoya. İki bacak yazılır;
// toplam değişmez, kırılım değişir.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "stock.manage");
    const input = await parseBody(req, stockTransferSchema);
    return Response.json(await transferStock(input, user.id), { status: 201 });
  });
}
