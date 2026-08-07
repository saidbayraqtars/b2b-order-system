import type { NextRequest } from "next/server";
import { prisma } from "@repo/database";
import { getOrderDetail } from "@repo/services";
import { AuthError, requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

const ALL_ROLES = [
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
  "SUPER_ADMIN",
] as const;

// GET /api/orders/:id — full detail, scoped to what the caller may see.
export function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(ALL_ROLES, "orders.view");

    // Authorize through the order's company so reps stay inside their portfolio.
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { companyId: true },
    });
    if (!order) throw new AuthError(403, "Bu siparişe erişiminiz yok");
    await resolveCompanyId(user, order.companyId);

    const detail = await getOrderDetail(params.id, {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
    });
    return Response.json({ order: detail });
  });
}
