import type { NextRequest } from "next/server";
import {
  getCommissionAccrual,
  listCommissionPlans,
  saveCommissionPlan,
} from "@repo/services";
import { saveCommissionPlanSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/commission?ay=YYYY-MM → planlar + o dönemin hakedişi
// POST /api/admin/commission            → plan ekle/güncelle
//
// Plan ve hakediş tek uçtan dönüyor çünkü ekran ikisini birlikte gösteriyor ve
// hakediş plansız anlamsız: iki istek, iki farklı ana ait iki cevap demek olurdu.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "commission.manage");

    const raw = new URL(req.url).searchParams.get("ay");
    // `YYYY-MM` → o ayın ortası. Ay başı vermek, yaz saati geçişinde bir
    // önceki aya düşme riski taşıyor; ortası hiçbir sınıra yakın değil.
    const anchor = /^\d{4}-\d{2}$/.test(raw ?? "")
      ? new Date(Number(raw!.slice(0, 4)), Number(raw!.slice(5, 7)) - 1, 15)
      : new Date();

    const [plans, accrual] = await Promise.all([
      listCommissionPlans(),
      getCommissionAccrual(anchor),
    ]);
    return Response.json({ plans, accrual });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "commission.manage");
    const input = await parseBody(req, saveCommissionPlanSchema);
    return Response.json({ plan: await saveCommissionPlan(input) }, { status: 201 });
  });
}
