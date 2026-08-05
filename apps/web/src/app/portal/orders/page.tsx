import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PortalNav } from "@/components/portal-nav";
import { OrdersBoard } from "@/components/orders-board";

// The buying company's own order list. Staff read it; approving stays on
// /portal/approvals, which is company-admin only.
export default async function PortalOrdersPage() {
  const user = await requirePage([
    "COMPANY_ADMIN",
    "COMPANY_STAFF",
    "SUPER_ADMIN",
  ]);
  const canAct = user.role !== "COMPANY_STAFF";

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
        companyName={company?.name ?? user.name}
        userName={user.name}
        current="/portal/orders"
      />
      <div className="mx-auto max-w-5xl px-4 pb-6">
        <h1 className="mb-4 text-lg font-semibold">Siparişlerim</h1>
        <OrdersBoard
          canApproveCredit={user.role === "SUPER_ADMIN"}
          canAct={canAct}
        />
      </div>
    </div>
  );
}
