import { approveOrder } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// POST /api/orders/:id/approve — COMPANY_ADMIN (own company) or SUPER_ADMIN.
export function POST(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["COMPANY_ADMIN", "SUPER_ADMIN"]);
    const result = await approveOrder(params.id, {
      approverId: user.id,
      approverRole: user.role,
      approverCompanyId: user.companyId,
    });
    return Response.json(result);
  });
}
