import type { NextRequest } from "next/server";
import { getPaymentOptions } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

const ALL_BUYERS = [
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
  "SUPER_ADMIN",
] as const;

// GET /api/payment-options?companyId= — what this customer may pick at checkout.
//
// Not an admin route: the checkout panel calls it for whichever company the
// order is being placed for, so a rep ordering on a customer's behalf sees that
// customer's menu. `resolveCompanyId` is what stops them reading a company
// outside their portfolio — the same gate order creation goes through.
//
// This endpoint only *renders* the menu. It is not the authority: `buildQuote`
// re-checks the chosen method and term server-side, so a client that skips this
// call gains nothing.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(ALL_BUYERS);
    const { searchParams } = new URL(req.url);
    const companyId = await resolveCompanyId(user, searchParams.get("companyId"));

    return Response.json(await getPaymentOptions(companyId));
  });
}
