import { redirect } from "next/navigation";
import { requirePage } from "@/lib/guard";
import { resolvePortalContext } from "@/lib/portal-context";
import { PortalNav } from "@/components/portal-nav";
import { PageHeader } from "@/components/ui";
import { VisitRequestPanel } from "./_components/visit-request-panel";

export const dynamic = "force-dynamic";

type Props = { searchParams: { companyId?: string } };

/**
 * Bayinin ziyaret çağrısı ekranı.
 *
 * `companies.view` isteniyor: kendi firması adına bir talep açıyor, dolayısıyla
 * firma kavramına erişimi olmalı. Sipariş girme yetkisi aranmıyor — ziyaret
 * isteyen kişinin sipariş giren kişi olması gerekmiyor.
 */
export default async function PortalVisitPage({ searchParams }: Props) {
  const user = await requirePage(
    ["COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP", "SUPER_ADMIN"],
    "companies.view",
  );

  const ctx = await resolvePortalContext(user, searchParams.companyId);
  if (!ctx.companyId) redirect("/portal");

  return (
    <div>
      <PortalNav
        role={user.role}
        permissions={user.permissions}
        companyName={ctx.companyName}
        userName={user.name}
        current="/portal/ziyaret"
        isProxy={ctx.isProxy}
        companyId={ctx.companyId}
      />
      <main className="mx-auto max-w-3xl px-4 pb-10">
        <PageHeader
          title="Ziyaret çağrısı"
          subtitle="Satış temsilcinizin uğramasını isteyin"
        />
        <VisitRequestPanel companyId={ctx.companyId} />
      </main>
    </div>
  );
}
