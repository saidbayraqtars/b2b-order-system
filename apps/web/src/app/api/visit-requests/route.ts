import type { NextRequest } from "next/server";
import { createVisitRequest, listVisitRequests } from "@repo/services";
import { createVisitRequestSchema, VisitRequestStatusEnum } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

/**
 * GET /api/visit-requests — kimin ne göreceği role göre belli.
 *
 *  - plasiyer: kendisine düşen çağrılar,
 *  - süper admin: hepsi,
 *  - bayi: yalnızca kendi firmasının çağrıları (açtığı çağrının durumunu
 *    görebilmeli, başkasınınkini değil).
 */
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);

    const statusParam = searchParams.getAll("status");
    const statuses = statusParam.length
      ? statusParam.flatMap((s) => {
          const p = VisitRequestStatusEnum.safeParse(s);
          return p.success ? [p.data] : [];
        })
      : undefined;

    const day = searchParams.get("day");
    const forDay = day ? new Date(day) : undefined;

    if (user.role === "SALES_REP") {
      return Response.json({
        requests: await listVisitRequests({ salesRepId: user.id, statuses, forDay }),
      });
    }
    if (user.role === "SUPER_ADMIN") {
      const repId = searchParams.get("salesRepId") ?? undefined;
      return Response.json({
        requests: await listVisitRequests({ salesRepId: repId, statuses, forDay }),
      });
    }

    // Bayi kullanıcısı: kendi firması. resolveCompanyId zaten başka bir firma
    // istenirse 403 atıyor.
    const companyId = await resolveCompanyId(user, searchParams.get("companyId"));
    return Response.json({
      requests: await listVisitRequests({ companyId, statuses }),
    });
  });
}

/** POST /api/visit-requests — "uğrayın" çağrısı aç. */
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser();

    const json = await req.json().catch(() => null);
    const parsed = createVisitRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    // Hangi firma adına çağrı açıldığı tek yerden yetkilendirilir: bayi kendi
    // firması, plasiyer/süper admin seçtiği firma adına.
    const companyId = await resolveCompanyId(user, parsed.data.companyId ?? null);

    const request = await createVisitRequest({
      companyId,
      requestedFor: parsed.data.requestedFor
        ? new Date(parsed.data.requestedFor)
        : null,
      note: parsed.data.note ?? null,
      createdById: user.id,
    });
    return Response.json({ request }, { status: 201 });
  });
}
