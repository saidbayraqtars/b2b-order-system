import { deleteCommissionPlan } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// DELETE /api/admin/commission/:id — planı siler.
//
// Hakediş **hesaplanmış bir sayı değil**, her okumada yeniden hesaplanıyor;
// dolayısıyla plan silinince geçmiş hakediş de kaybolur. Ödenmiş bir dönemin
// kaydını tutmak isteyen kurulum planı silmez, **pasife alır**.
export function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "commission.manage");
    await deleteCommissionPlan(params.id);
    return Response.json({ ok: true });
  });
}
