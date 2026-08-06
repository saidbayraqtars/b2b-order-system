import type { NextRequest } from "next/server";
import { getVolumeStatus } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

const ALL_BUYERS = [
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
  "SUPER_ADMIN",
] as const;

// GET /api/volume-status?companyId= — where this customer stands on the ladder.
//
// Display only: the rate that is actually charged is resolved inside pricing on
// every request, so this endpoint cannot grant a discount by being wrong or by
// being skipped. `resolveCompanyId` keeps a rep to its own portfolio, the same
// gate the checkout endpoints use.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(ALL_BUYERS);
    const { searchParams } = new URL(req.url);
    const companyId = await resolveCompanyId(user, searchParams.get("companyId"));

    return Response.json(await getVolumeStatus(companyId));
  });
}
