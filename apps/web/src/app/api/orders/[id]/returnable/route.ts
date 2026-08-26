import type { NextRequest } from "next/server";
import { listReturnableLines } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { returnScopeFor } from "@/lib/return-scope";

// GET /api/orders/<id>/returnable — bu siparişten geriye ne iade edilebilir.
//
// Ayrı bir uç, sipariş detayının içinde bir alan değil: hesap sipariş
// okunurken değil, iade formu açılırken gerekiyor ve her sipariş görüntülemede
// açık talepleri toplamak, hiç iade edilmeyecek siparişler için ödenen bir
// maliyet olurdu.
//
// Sevk edilmemiş sipariş boş liste değil **hata** döndürüyor: çıkmamış mal geri
// gelmez, o iş iptaldir ve kullanıcıya bunun söylenmesi gerekiyor. Kısıt
// servisin kendisinde; burada yalnızca kapsam veriliyor.
export function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(
      ["SUPER_ADMIN", "SALES_REP", "COMPANY_ADMIN", "COMPANY_STAFF"],
      "orders.view",
    );
    const lines = await listReturnableLines(params.id, returnScopeFor(user));
    return Response.json({ lines });
  });
}
