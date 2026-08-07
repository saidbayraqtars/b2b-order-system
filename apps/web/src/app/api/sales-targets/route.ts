import type { NextRequest } from "next/server";
import {
  getTargetProgress,
  listSalesTargets,
  upsertSalesTarget,
} from "@repo/services";
import { salesTargetSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";

/**
 * GET /api/sales-targets?salesRepId=&progress=1
 *
 * İki farklı okuyucu var ve ikisi de aynı uçtan besleniyor:
 *  - hedefi *koyan* kişi (targets.manage) herkesin listesini görür,
 *  - hedefi *taşıyan* temsilci yalnızca kendi karnesini görür ve bunun için
 *    ayrı bir izne ihtiyacı yoktur — kendi hedefini görmek yetki değil.
 */
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const requested = searchParams.get("salesRepId");
    const wantsProgress = searchParams.get("progress") === "1";

    const canManage = user.permissions.includes("targets.manage");
    // Yetkisi olmayan yalnızca kendi satırlarını okuyabilir; başkasının
    // kimliğini yazsa bile kendi kimliğine indirilir.
    const salesRepId = canManage ? (requested ?? undefined) : user.id;

    if (wantsProgress) {
      if (!salesRepId) {
        throw new InputError("İlerleme için salesRepId gerekli");
      }
      return Response.json({ progress: await getTargetProgress(salesRepId) });
    }

    return Response.json({ targets: await listSalesTargets({ salesRepId }) });
  });
}

/** POST /api/sales-targets — hedef koy ya da güncelle. */
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(undefined, "targets.manage");

    const json = await req.json().catch(() => null);
    const parsed = salesTargetSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const target = await upsertSalesTarget(
      {
        salesRepId: parsed.data.salesRepId,
        metric: parsed.data.metric,
        period: parsed.data.period,
        periodStart: new Date(parsed.data.periodStart),
        targetValue: parsed.data.targetValue,
        note: parsed.data.note ?? null,
      },
      user.id,
    );
    return Response.json({ target }, { status: 201 });
  });
}
