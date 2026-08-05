import { redirect } from "next/navigation";
import { requirePage } from "@/lib/guard";
import { resolvePortalContext } from "@/lib/portal-context";
import { PortalNav } from "@/components/portal-nav";
import { StatementView } from "@/components/statement-view";

export const dynamic = "force-dynamic";

type Props = { searchParams: { companyId?: string } };

// Cari ekstre. Alıcı kendi firmasının, plasiyer/süper admin seçili firmanın
// ekstresini görür — plasiyerin sipariş almadan önce bakiyeye bakması işin
// normal parçası.
export default async function PortalStatementPage({ searchParams }: Props) {
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
        current="/portal/statement"
        isProxy={ctx.isProxy}
        companyId={ctx.companyId}
      />
      <div className="mx-auto max-w-5xl px-4 pb-6">
        <h1 className="mb-4 text-lg font-semibold">
          {ctx.isProxy ? `${ctx.companyName} — Cari Ekstre` : "Cari Ekstre"}
        </h1>
        <StatementView companyId={ctx.companyId} />
      </div>
    </div>
  );
}
