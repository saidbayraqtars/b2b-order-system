import type { NextRequest } from "next/server";
import { promotionPerformance } from "@repo/services";
import { PERFORMANCE_WINDOW_DAYS, parsePerformanceWindow } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/admin/promotions/performance?pencere= — kampanya karnesi.
//
// Canlı hesaplanıyor, gecelik özete girmiyor: sorgular kampanya sayısıyla
// sınırlı (bir kurulumda onlarca, binlerce değil) ve ekran açıldığında son
// hâli görmek isteniyor — dün gece açılan kampanya bugün karnesiz kalmamalı.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "promotions.manage");
    const window = parsePerformanceWindow(
      new URL(req.url).searchParams.get("pencere"),
    );
    return Response.json(
      await promotionPerformance(PERFORMANCE_WINDOW_DAYS[window]),
    );
  });
}
