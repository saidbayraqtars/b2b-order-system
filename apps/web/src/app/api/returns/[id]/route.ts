import type { NextRequest } from "next/server";
import { actOnReturn, getReturn } from "@repo/services";
import { returnActionSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { returnActorFor, returnScopeFor } from "@/lib/return-scope";

// Tek talep: oku ve durumunu ilerlet.
//
// Kabul, ret, teslim alma ve iptal aynı POST'tan geçiyor — "hangi geçiş nerede
// yapılıyor" sorusunun tek cevabı olsun diye. Yetki ayrımı burada değil
// serviste: `returns.manage` olmayan taraf (bayi) yalnızca kendi talebini
// iptal edebiliyor, çünkü bu bir ekran kuralı değil belge kuralı.

const RETURN_ROLES = [
  "SUPER_ADMIN",
  "SALES_REP",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
] as const;

export function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(RETURN_ROLES, "orders.view");
    const found = await getReturn(params.id, returnScopeFor(user));
    return Response.json({ return: found });
  });
}

export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(RETURN_ROLES, "orders.view");

    const json = await req.json().catch(() => null);
    const parsed = returnActionSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const updated = await actOnReturn(
      params.id,
      parsed.data,
      returnActorFor(user),
      returnScopeFor(user),
    );
    return Response.json({ return: updated });
  });
}
