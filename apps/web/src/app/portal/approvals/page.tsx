import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PortalNav } from "@/components/portal-nav";
import { OrdersBoard } from "@/components/orders-board";

// Company-admin approval surface. COMPANY_ADMIN may approve PENDING_APPROVAL;
// PENDING_CREDIT still requires a super admin (canApproveCredit=false).
export default async function ApprovalsPage() {
  const user = await requirePage(["COMPANY_ADMIN", "SUPER_ADMIN"], "orders.approve");
  const isSuper = user.role === "SUPER_ADMIN";

  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
    : null;

  return (
    <div>
      <PortalNav
        role={user.role}
        permissions={user.permissions}
        companyName={company?.name ?? user.name}
        userName={user.name}
        current="/portal/approvals"
      />
      <div className="mx-auto max-w-5xl px-4 pb-6">
        <h1 className="mb-4 text-lg font-semibold">Sipariş Onayları</h1>
        <OrdersBoard canApproveCredit={isSuper} />
      </div>
    </div>
  );
}
