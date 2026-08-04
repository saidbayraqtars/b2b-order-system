import { approveOrder, notifyOrderStatusChanged } from "@repo/services";
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
    // A company approval can leave the order at PENDING_CREDIT; the notifier
    // only announces states worth announcing, so passing the result is safe.
    await notifyOrderStatusChanged(result.orderId, result.status);
    return Response.json(result);
  });
}
