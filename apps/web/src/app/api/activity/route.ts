import type { NextRequest } from "next/server";
import { listActivity } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/activity?companyId=&from=&to=&limit= — one timeline out of the
// order history, the cari ledger and (for administrators) the audit trail.
//
// Read-only and scoped inside the service: a rep sees their portfolio, a
// company user sees their own company, and the audit trail — which names no
// company — is administrator-only, because merging it in for everyone would
// show a customer other people's logins.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser([
      "SUPER_ADMIN",
      "SALES_REP",
      "COMPANY_ADMIN",
    ]);
    const params = new URL(req.url).searchParams;

    const date = (value: string | null): Date | undefined => {
      if (!value) return undefined;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };

    const entries = await listActivity(
      { userId: user.id, role: user.role, companyId: user.companyId },
      {
        companyId: params.get("companyId") ?? undefined,
        from: date(params.get("from")),
        to: date(params.get("to")),
        limit: Number(params.get("limit")) || undefined,
      },
    );
    return Response.json({ entries });
  });
}
