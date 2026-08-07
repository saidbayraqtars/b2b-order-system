import { createPaymentTerm, listPaymentTerms } from "@repo/services";
import { createPaymentTermSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/payment-terms — vade definitions for the admin screen.
// POST /api/admin/payment-terms
//
// Definitions are global; which customer may pick which is set per company
// (Company.paymentTerms), so these two operations are super-admin only.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "payment_terms.manage");
    const terms = await listPaymentTerms();
    return Response.json({ terms });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "payment_terms.manage");
    const input = await parseBody(req, createPaymentTermSchema);

    return Response.json(await createPaymentTerm(input), { status: 201 });
  });
}
