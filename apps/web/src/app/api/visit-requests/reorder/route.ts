import type { NextRequest } from "next/server";
import { reorderVisitRequests } from "@repo/services";
import { reorderVisitsSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";

const FIELD_ROLES = ["SALES_REP", "SUPER_ADMIN"] as const;

/**
 * POST /api/visit-requests/reorder — günün ziyaret sırasını yaz.
 *
 * Listenin tamamı gönderilir, tek tek taşıma isteği değil: iki satırın yerini
 * değiştirmek iki ayrı yazma olsaydı araya giren başka bir değişiklikte sıra
 * bozulurdu.
 */
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(FIELD_ROLES, "visits.manage");

    const json = await req.json().catch(() => null);
    const parsed = reorderVisitsSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    // Plasiyer yalnızca kendi çağrılarını sıralayabilir; süper admin hepsini.
    await reorderVisitRequests(
      parsed.data.ids,
      user.role === "SALES_REP" ? user.id : null,
    );
    return new Response(null, { status: 204 });
  });
}
