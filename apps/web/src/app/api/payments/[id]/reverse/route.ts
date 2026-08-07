import type { NextRequest } from "next/server";
import { reversePayment } from "@repo/services";
import { reversePaymentSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

// POST /api/payments/:id/reverse — undo a collection entered by mistake.
//
// Not DELETE: nothing is removed. The handler writes an opposing DEBIT that
// points at the original, so both rows stay on the ekstre. The caller names the
// company it belongs to and is authorized for that company the same way as
// everywhere else; the service then checks the stored row actually matches, so
// a guessed transaction id gets nowhere.
export function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SALES_REP", "SUPER_ADMIN"], "cash.manage");

    const json = await req.json().catch(() => null);
    const parsed = reversePaymentSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const companyId = await resolveCompanyId(user, parsed.data.companyId);

    const result = await reversePayment(
      { transactionId: params.id, companyId, reason: parsed.data.reason },
      user.id,
    );
    return Response.json(result, { status: 201 });
  });
}
