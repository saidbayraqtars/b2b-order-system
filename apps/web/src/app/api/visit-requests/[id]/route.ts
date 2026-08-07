import type { NextRequest } from "next/server";
import { updateVisitRequest } from "@repo/services";
import { updateVisitRequestSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";

const FIELD_ROLES = ["SALES_REP", "SUPER_ADMIN"] as const;

/**
 * PATCH /api/visit-requests/:id — durumu, gününü ya da notunu değiştir.
 *
 * Yalnızca saha tarafı: çağrıyı açan bayi onu "ziyaret edildi" yapamamalı,
 * yoksa gerçekleşmemiş bir ziyaret kayda geçebilirdi.
 */
export function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(FIELD_ROLES, "visits.manage");

    const json = await req.json().catch(() => null);
    const parsed = updateVisitRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const request = await updateVisitRequest(params.id, {
      status: parsed.data.status,
      requestedFor:
        parsed.data.requestedFor === undefined
          ? undefined
          : parsed.data.requestedFor
            ? new Date(parsed.data.requestedFor)
            : null,
      note: parsed.data.note,
    });
    return Response.json({ request });
  });
}
