import { redirect } from "next/navigation";
import { requirePage } from "@/lib/guard";
import { resolvePortalContext } from "@/lib/portal-context";
import { PortalNav } from "@/components/portal-nav";
import { OrdersBoard } from "@/components/orders-board";

export const dynamic = "force-dynamic";

type Props = { searchParams: { companyId?: string } };

// Firmanın sipariş listesi. Alıcı kendi firmasını görür; plasiyer/süper admin
// seçili firmanın siparişlerini — onay yetkisi rolden gelir, ekrandan değil.
export default async function PortalOrdersPage({ searchParams }: Props) {
  const user = await requirePage([
    "COMPANY_ADMIN",
    "COMPANY_STAFF",
    "SALES_REP",
    "SUPER_ADMIN",
  ]);

  const ctx = await resolvePortalContext(user, searchParams.companyId);
  if (!ctx.companyId) redirect("/portal");

  return (
    <div>
      <PortalNav
        role={user.role}
        companyName={ctx.companyName}
        userName={user.name}
        current="/portal/orders"
        isProxy={ctx.isProxy}
        companyId={ctx.companyId}
      />
      <div className="mx-auto max-w-5xl px-4 pb-6">
        <h1 className="mb-4 text-lg font-semibold">
          {ctx.isProxy ? `${ctx.companyName} — Siparişler` : "Siparişlerim"}
        </h1>
        <OrdersBoard
          companyId={ctx.companyId}
          canApproveCredit={user.role === "SUPER_ADMIN"}
          canAct={user.role !== "COMPANY_STAFF"}
        />
      </div>
    </div>
  );
}
