import { redirect } from "next/navigation";
import { requirePage } from "@/lib/guard";
import { resolvePortalContext } from "@/lib/portal-context";
import { PortalNav } from "@/components/portal-nav";
import { PageHeader } from "@/components/ui";
import { StatementView } from "@/components/statement-view";
import { ReconciliationPanel } from "@/components/reconciliation-panel";

export const dynamic = "force-dynamic";

type Props = { searchParams: { companyId?: string } };

// Cari ekstre. Alıcı kendi firmasının, plasiyer/süper admin seçili firmanın
// ekstresini görür — plasiyerin sipariş almadan önce bakiyeye bakması işin
// normal parçası.
export default async function PortalStatementPage({ searchParams }: Props) {
  const user = await requirePage(
    ["COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP", "SUPER_ADMIN"],
    "companies.view",
  );

  const ctx = await resolvePortalContext(user, searchParams.companyId);
  if (!ctx.companyId) redirect("/portal");

  return (
    <PortalNav
      role={user.role}
      permissions={user.permissions}
      companyName={ctx.companyName}
      userName={user.name}
      isProxy={ctx.isProxy}
      companyId={ctx.companyId}
    >
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Cari Ekstre"
          subtitle={
            ctx.isProxy
              ? `${ctx.companyName} — bakiye, yaşlandırma ve hareketler`
              : "Bakiye, yaşlandırma ve hesap hareketleri"
          }
        />
        {/* Mutabakat ekstrenin üstünde: bir bakiye hakkında ve müşteri o
            bakiyeye zaten burada bakıyor. Cevaplanmamış mektup yoksa hiçbir
            şey çizmiyor. */}
        <ReconciliationPanel companyId={ctx.companyId} />
        <StatementView companyId={ctx.companyId} />
      </div>
    </PortalNav>
  );
}
