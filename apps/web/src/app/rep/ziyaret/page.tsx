import { requirePage } from "@/lib/guard";
import { resolvePortalContext } from "@/lib/portal-context";
import { RepNav } from "@/components/rep-nav";
import { VisitPanel } from "./_components/visit-panel";
import { VisitPlan } from "./_components/visit-plan";

export const dynamic = "force-dynamic";

type Props = { searchParams: { companyId?: string } };

/**
 * Ziyaret (check-in) ekranı. `/api/checkins` mobilden beri vardı, web'de karşılığı yoktu.
 *
 * Firma seçimi burada **zorunlu değil**: ziyaret geçmişini okumak için firma
 * gerekmez, yalnızca yeni ziyaret açmak için gerekir. Bu yüzden seçilmemişse
 * firma seçtiren bir duvar yerine geçmiş listelenir ve açık ziyaret gösterilir.
 */
export default async function RepVisitPage({ searchParams }: Props) {
  const user = await requirePage(["SALES_REP", "SUPER_ADMIN"], "visits.manage");

  // Firma verilmişse yetkilendirmeden geçir (portföy dışı firma → /403).
  const ctx = searchParams.companyId
    ? await resolvePortalContext(user, searchParams.companyId)
    : null;

  return (
    <div>
      <RepNav
        userName={user.name}
        permissions={user.permissions}
        current="/rep/ziyaret"
        companyId={ctx?.companyId}
        companyName={ctx?.companyName}
        showCompany
      />
      <div className="mx-auto max-w-4xl px-4 pb-10">
        {/* Gün planı üstte: ekranı açan plasiyerin ilk sorusu "bugün nereye
            gideceğim", "geçmiş ziyaretlerim ne" değil. */}
        <VisitPlan />
        <VisitPanel
          companyId={ctx?.companyId ?? null}
          companyName={ctx?.companyName ?? null}
        />
      </div>
    </div>
  );
}
