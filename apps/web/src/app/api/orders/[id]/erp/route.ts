import { getErpPushStatus, pushOrderToErp } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET  /api/orders/:id/erp — bu sipariş ERP'ye aktarıldı mı, aktarılabilir mi.
// POST /api/orders/:id/erp — aktar.
//
// İnsan onayı, kılavuzun üç katmanlı kilidinin (§43.1) üçüncü katmanı: belge
// kendiliğinden gitmiyor, `erp.push` yetkisi olan biri onaylanmış bir siparişte
// düğmeye basıyor. Diğer iki katman ajanda: `write.enabled` bayrağı ve VEGADB
// kullanıcısının yazma yetkisi.
//
// Gövde yok — aktarılacak şey siparişin kendisi, ve ne yazılacağına servis
// karar veriyor. İstemcinin belirleyebileceği bir alan bırakmak, "ERP'ye ne
// yazılacağını tarayıcı söyler" demenin uzun yolu olurdu.
export function GET(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "erp.push");
    return Response.json(await getErpPushStatus(params.id));
  });
}

export function POST(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "erp.push");
    const result = await pushOrderToErp(params.id, { userId: user.id });
    return Response.json(result);
  });
}
