import type { NextRequest } from "next/server";
import { createReturn, listReturns } from "@repo/services";
import { createReturnSchema, ReturnStatusEnum } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { returnActorFor, returnScopeFor } from "@/lib/return-scope";

// İade talepleri.
//
// Talep açmak ile karara bağlamak ayrı yetkiler ve bilerek aynı uçta değil:
// buradaki POST yalnızca **talep** açıyor, kabul/ret/teslim alma
// `/api/returns/[id]` altında. Bayi kendi siparişinin iadesini isteyebilmeli,
// ama kendi iadesini onaylayıp stok girişi ve cari alacak yazdıramamalı.
//
// Bu yüzden kapı `orders.view`: iadeyi isteyebilen, siparişi görebilendir.
// `returns.manage` karar ucunda aranıyor.

const RETURN_ROLES = [
  "SUPER_ADMIN",
  "SALES_REP",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
] as const;

export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(RETURN_ROLES, "orders.view");

    const q = new URL(req.url).searchParams;
    const status = ReturnStatusEnum.safeParse(q.get("status"));
    const companyId = q.get("companyId");
    const orderId = q.get("orderId");

    const returns = await listReturns(
      {
        ...(status.success ? { status: status.data } : {}),
        ...(companyId ? { companyId } : {}),
        ...(orderId ? { orderId } : {}),
        ...(q.get("open") === "1" ? { openOnly: true } : {}),
      },
      returnScopeFor(user),
    );

    return Response.json({ returns });
  });
}

export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(RETURN_ROLES, "orders.view");

    const json = await req.json().catch(() => null);
    const parsed = createReturnSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const created = await createReturn(
      parsed.data,
      returnActorFor(user),
      returnScopeFor(user),
    );
    return Response.json({ return: created }, { status: 201 });
  });
}
