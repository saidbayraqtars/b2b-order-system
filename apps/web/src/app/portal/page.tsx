import { requirePage } from "@/lib/guard";
import { resolvePortalContext } from "@/lib/portal-context";
import { PortalNav } from "@/components/portal-nav";
import { PickCompany } from "./_components/pick-company";
import { PortalClient } from "./_components/portal-client";

export const dynamic = "force-dynamic";

type Props = { searchParams: { companyId?: string } };

export default async function PortalPage({ searchParams }: Props) {
  const user = await requirePage([
    "COMPANY_ADMIN",
    "COMPANY_STAFF",
    "SALES_REP",
    "SUPER_ADMIN",
  ]);

  const ctx = await resolvePortalContext(user, searchParams.companyId);

  // Plasiyer / süper admin henüz firma seçmedi: katalog yerine seçim ekranı.
  // Fiyat firmaya göre çözüldüğü için firmasız katalog zaten anlamsız olurdu.
  if (!ctx.companyId) {
    return (
      <div className="min-h-screen tech-paper">
        <PortalNav
          role={user.role}
          companyName={null}
          userName={user.name}
          current="/portal"
          isProxy
        />
        <PickCompany />
      </div>
    );
  }

  return (
    <PortalClient
      companyId={ctx.companyId}
      companyName={ctx.companyName ?? "Firma"}
      userName={user.name}
      role={user.role}
      isProxy={ctx.isProxy}
      availableCredit={ctx.availableCredit}
    />
  );
}
