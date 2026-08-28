import type { NextRequest } from "next/server";
import {
  getReconciliationSummary,
  listReconciliations,
  sendReconciliations,
} from "@repo/services";
import { ReconciliationStatusEnum, sendReconciliationsSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";
import { resolveCompanyId } from "@/lib/company-access";

const SELLER = ["SUPER_ADMIN"] as const;
const BUYERS = ["COMPANY_ADMIN", "COMPANY_STAFF"] as const;

// GET  /api/reconciliations — satıcı için tümü, bayi için kendi firmasınınki.
// POST /api/reconciliations — dönem mektuplarını üret (satıcı).
//
// Tek uç iki tarafa birden hizmet ediyor çünkü **liste aynı liste**; fark
// yalnızca kapsam. Bayiye ayrı bir uç açmak, aynı satırları iki yerde
// biçimlendirmek olurdu.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser([...SELLER, ...BUYERS], "orders.view");
    const { searchParams } = new URL(req.url);
    const parsed = ReconciliationStatusEnum.safeParse(searchParams.get("status"));

    // Bayi yalnızca kendi firmasını görüyor; satıcı isterse süzüyor.
    const isSeller = user.role === "SUPER_ADMIN";
    const requested = searchParams.get("companyId");
    const companyId = isSeller
      ? (requested ?? undefined)
      : await resolveCompanyId(user, requested);

    const changes = await listReconciliations({
      status: parsed.success ? parsed.data : undefined,
      companyId,
    });

    // Özet yalnızca satıcıya: bayi için "kaç firma itiraz etti" diye bir soru
    // yok, kendi tek mektubu var.
    return Response.json({
      reconciliations: changes,
      summary: isSeller ? await getReconciliationSummary() : null,
    });
  });
}

export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(SELLER, "reconciliation.manage");
    const input = await parseBody(req, sendReconciliationsSchema);
    const result = await sendReconciliations(input, user.id);
    return Response.json({ result }, { status: 201 });
  });
}
