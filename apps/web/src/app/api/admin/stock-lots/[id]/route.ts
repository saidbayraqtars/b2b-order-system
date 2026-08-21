import { updateLot } from "@repo/services";
import { stockLotUpdateSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// PATCH /api/admin/stock-lots/[id] — künye düzeltme ve bloke/blokeyi kaldır.
//
// Parti silinmiyor: sıfıra düşen parti de geçmiş sevkiyatların işaret ettiği
// satırdır. Elde duran malı yok etmenin yolu fire (`/write-off`), künyeyi
// yok etmenin yolu yok.
export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "stock.manage");
    const { id } = await ctx.params;
    const input = await parseBody(req, stockLotUpdateSchema);
    return Response.json(await updateLot(id, input));
  });
}
