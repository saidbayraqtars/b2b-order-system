import { notifyOrderStatusChanged, rejectOrder } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// POST /api/orders/:id/reject — COMPANY_ADMIN (own company) or SUPER_ADMIN.
export function POST(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["COMPANY_ADMIN", "SUPER_ADMIN"], "orders.approve");
    const result = await rejectOrder(params.id, {
      approverId: user.id,
      approverRole: user.role,
      approverCompanyId: user.companyId,
    });
    await notifyOrderStatusChanged(result.orderId, result.status);
    return Response.json(result);
  });
}
