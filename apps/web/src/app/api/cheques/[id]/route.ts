import type { NextRequest } from "next/server";
import { advanceCheque, getCheque, updateChequeDetails } from "@repo/services";
import { chequeActionSchema, updateChequeSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";

// Tek kâğıt: geçmişiyle birlikte oku, künyesini düzelt, durumunu ilerlet.
//
// PATCH künye, POST durum. Ayrı fiiller çünkü ayrı işler: künye düzeltmesi
// hiçbir deftere dokunmaz, durum değişikliği kasaya ya da cariye yazar.

export function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "cheques.manage");
    const cheque = await getCheque(params.id);
    if (!cheque) return Response.json({ error: "Bulunamadı" }, { status: 404 });
    return Response.json({ cheque });
  });
}

export function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "cheques.manage");

    const json = await req.json().catch(() => null);
    const parsed = updateChequeSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const result = await updateChequeDetails(params.id, parsed.data, user.id);
    return Response.json(result);
  });
}

export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "cheques.manage");

    const json = await req.json().catch(() => null);
    const parsed = chequeActionSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const result = await advanceCheque(params.id, parsed.data, user.id);
    return Response.json(result);
  });
}
