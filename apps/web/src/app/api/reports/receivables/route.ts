import { getReceivables } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/reports/receivables — aging across every company.
// A SALES_REP sees only their own portfolio; a super admin sees everyone.
export function GET() {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN", "SALES_REP"]);

    return Response.json(
      await getReceivables(
        user.role === "SALES_REP" ? { salesRepId: user.id } : {},
      ),
    );
  });
}
