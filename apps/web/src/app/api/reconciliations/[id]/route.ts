import { NextRequest } from "next/server";
import {
  cancelReconciliation,
  getReconciliation,
  recordAudit,
  respondToReconciliation,
} from "@repo/services";
import { respondReconciliationSchema } from "@repo/types";
import { AuthError, requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";
import { resolveCompanyId } from "@/lib/company-access";

// POST   /api/reconciliations/:id — müşterinin cevabı (mutabık / itiraz)
// DELETE /api/reconciliations/:id — satıcı mektubu geri çeker
export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(
      ["COMPANY_ADMIN", "COMPANY_STAFF", "SUPER_ADMIN"],
      "orders.view",
    );
    const input = await parseBody(req, respondReconciliationSchema);

    // Mektup gerçekten bu kullanıcının firmasına mı ait. Kimlik kontrolü
    // serviste değil burada: servis kimin çağırdığını bilmiyor ve bilmemeli.
    const row = await getReconciliation(params.id);
    // 403, 404 değil: var olmayan bir kimlik ile başkasına ait bir kimlik
    // ayırt edilemez olmalı — yoksa uç, başka firmaların mutabakatlarını
    // yoklamanın yolu olur (sipariş erişimindeki kuralın aynısı).
    if (!row) throw new AuthError(403, "Bu mutabakata erişiminiz yok");
    await resolveCompanyId(user, row.companyId);

    const updated = await respondToReconciliation(
      { id: params.id, agreed: input.agreed, note: input.note },
      user.id,
    );

    // Mutabakat cevabı bir **beyan**: kim, ne zaman, ne dedi denetim kaydında
    // duruyor. Defter oynamıyor, dolayısıyla izi yalnızca burada kalıyor.
    await recordAudit({
      actor: user,
      action: "RECONCILIATION_ANSWERED",
      entity: "Reconciliation",
      entityId: params.id,
      summary: input.agreed
        ? `${row.companyName} mutabık (${row.balance} ₺)`
        : `${row.companyName} itiraz etti (${row.balance} ₺)`,
      meta: { agreed: input.agreed, note: input.note ?? null },
    });

    return Response.json({ reconciliation: updated });
  });
}

export function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "reconciliation.manage");
    await cancelReconciliation(params.id, user.id);
    return Response.json({ ok: true });
  });
}
