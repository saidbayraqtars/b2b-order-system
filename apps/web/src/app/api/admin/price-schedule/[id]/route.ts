import { cancelScheduledPriceChange, recordAudit } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// DELETE /api/admin/price-schedule/:id — bekleyen bir değişikliği iptal eder.
//
// Uygulanmış bir satır iptal edilemiyor: fiyatı geri almak ayrı bir karar ve
// yeni bir zamanlı değişiklikle yapılıyor. Sessizce geri sarmak, aradaki
// siparişlerin hangi fiyattan geçtiğini belirsiz bırakırdı.
export function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "pricing.manage");
    await cancelScheduledPriceChange(params.id);

    await recordAudit({
      actor: user,
      action: "PRICES_IMPORTED",
      entity: "ScheduledPriceChange",
      entityId: params.id,
      summary: "Zamanlı fiyat değişikliği iptal edildi",
    });
    return Response.json({ ok: true });
  });
}
