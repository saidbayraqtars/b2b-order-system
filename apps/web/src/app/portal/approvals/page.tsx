import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PortalNav } from "@/components/portal-nav";
import { OrdersBoard } from "@/components/orders-board";
import { PageHeader } from "@/components/ui";

// Company-admin approval surface. COMPANY_ADMIN may approve PENDING_APPROVAL;
// PENDING_CREDIT still requires a super admin (canApproveCredit=false).
export default async function ApprovalsPage() {
  const user = await requirePage(
    ["COMPANY_ADMIN", "SUPER_ADMIN"],
    "orders.approve",
  );
  const isSuper = user.role === "SUPER_ADMIN";

  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
    : null;

  return (
    <PortalNav
      role={user.role}
      permissions={user.permissions}
      companyName={company?.name ?? user.name}
      userName={user.name}
    >
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Sipariş Onayları"
          subtitle="Onay bekleyen siparişleri buradan geçirin ya da reddedin"
        />
        {/* Başlık "onay bekleyen" diyordu, liste firmanın bütün geçmişini
            döküyordu. Firma sütunu yalnız birden çok firma görene. */}
        <OrdersBoard
          canApproveCredit={isSuper}
          filters={false}
          group="bekleyen"
          showCompany={isSuper}
          emptyLabel="Onay bekleyen sipariş yok."
        />
      </div>
    </PortalNav>
  );
}
