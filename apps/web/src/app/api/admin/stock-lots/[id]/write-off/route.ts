import { writeOffLot } from "@repo/services";
import { stockLotWriteOffSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// POST /api/admin/stock-lots/[id]/write-off — fire/imha.
//
// Sayımdan ayrı uç: sayım "defter yanılmış", fire "mal gitti" demek ve gıdada
// yıl sonunda bu ikisinin toplamı ayrı ayrı sorulan iki sayıdır.
type Params = { params: { id: string } };

export function POST(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "stock.manage");
    const input = await parseBody(req, stockLotWriteOffSchema);
    return Response.json(await writeOffLot(params.id, input, user.id), {
      status: 201,
    });
  });
}
