import type { NextRequest } from "next/server";
import { prisma } from "@repo/database";
import { listActiveAnnouncements } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

// GET /api/announcements?companyId= — what this customer should see right now.
//
// The group filter runs in the query, not in the browser: an announcement
// marked "dealers only" is never sent to a company outside that group, rather
// than being sent and then hidden client-side.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser([
      "COMPANY_ADMIN",
      "COMPANY_STAFF",
      "SALES_REP",
      "SUPER_ADMIN",
    ]);
    const { searchParams } = new URL(req.url);
    const companyId = await resolveCompanyId(user, searchParams.get("companyId"));

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { customerGroupId: true },
    });

    const announcements = await listActiveAnnouncements(
      company?.customerGroupId ?? null,
    );
    return Response.json({ announcements });
  });
}
