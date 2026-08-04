import type { NextRequest } from "next/server";
import { changeOrderStatus, notifyOrderStatusChanged } from "@repo/services";
import { changeOrderStatusSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// POST /api/orders/:id/status — fulfilment moves (super admin) and cancellation
// (super admin, or the buying company's admin before shipment). Who may do what
// is decided in the service, which also restocks and reverses the cari debit.
export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN", "COMPANY_ADMIN"]);
    const input = await parseBody(req, changeOrderStatusSchema);

    const result = await changeOrderStatus(params.id, input, {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
    });
    await notifyOrderStatusChanged(result.orderId, result.status, input.note);
    return Response.json(result);
  });
}
