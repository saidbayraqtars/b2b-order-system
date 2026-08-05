import type { NextRequest } from "next/server";
import { listPayments, recordPayment } from "@repo/services";
import { recordPaymentSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

const FIELD_ROLES = ["SALES_REP", "SUPER_ADMIN"] as const;

// POST /api/payments — field collection (tahsilat). Writes a CREDIT ledger entry
// and decrements the company's cached balance.
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(FIELD_ROLES);

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

// GET /api/payments?companyId= — collections to read back.
//
// With a company: everything credited to that (authorized) customer, whoever
// recorded it — a rep about to ask for money must see the office's entries too.
// Without one: the caller's own recent collections, which is the "what did I
// collect today" list. There is no unscoped listing.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(FIELD_ROLES);
    const requested = new URL(req.url).searchParams.get("companyId");

    const payments = requested
      ? await listPayments({
          kind: "company",
          companyId: await resolveCompanyId(user, requested),
        })
      : await listPayments({ kind: "recorder", recordedById: user.id });

    return Response.json({ payments });
  });
}
