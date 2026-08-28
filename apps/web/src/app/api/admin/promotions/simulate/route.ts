import type { NextRequest } from "next/server";
import { simulatePromotion } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { InputError } from "@/lib/guard";

// GET /api/admin/promotions/simulate?id=&from=&to=
//
// **Hiçbir şey yazmıyor.** GET olmasının sebebi bu: kuru koşu bir sorgudur,
// bir işlem değil — sonucu paylaşılabilir bir adres olarak durabilmeli.
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "promotions.manage");
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!id) throw new InputError("Kampanya seçilmedi.");
    if (!from || !to || !DAY.test(from) || !DAY.test(to)) {
      throw new InputError("Tarih aralığı YYYY-AA-GG biçiminde olmalı.");
    }

    return Response.json({ result: await simulatePromotion(id, { from, to }) });
  });
}
