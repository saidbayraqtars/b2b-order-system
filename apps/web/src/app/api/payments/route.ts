import type { NextRequest } from "next/server";
import { recordPayment } from "@repo/services";
import { recordPaymentSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

// POST /api/payments — field collection (tahsilat). Writes a CREDIT ledger entry
// and decrements the company's cached balance.
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SALES_REP", "SUPER_ADMIN"]);

    const json = await req.json().catch(() => null);
    const parsed = recordPaymentSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const companyId = await resolveCompanyId(user, parsed.data.companyId);

    const result = await recordPayment({ ...parsed.data, companyId }, user.id);
    return Response.json(result, { status: 201 });
  });
}
