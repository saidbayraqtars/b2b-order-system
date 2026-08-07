import { requirePage } from "@/lib/guard";
import { resolvePortalContext } from "@/lib/portal-context";
import { CompanyPicker } from "@/components/company-picker";
import { RepNav } from "@/components/rep-nav";
import { CollectionPanel } from "./_components/collection-panel";

export const dynamic = "force-dynamic";

type Props = { searchParams: { companyId?: string } };

/**
 * Tahsilat girişi — sahadan toplanan paranın cariye işlendiği ekran.
 *
 * `/api/payments` en baştan beri vardı ama yalnızca mobil uygulama çağırıyordu;
 * ofisten ya da bilgisayardan tahsilat girmenin yolu yoktu. Firma seçimi
 * Adım 22'nin kuralıyla aynı: URL'de taşınır ve `resolvePortalContext` ile
 * yetkilendirilir — yanlış cariye tahsilat, yanlış cariye siparişten daha
 * pahalıdır.
 */
export default async function RepCollectionPage({ searchParams }: Props) {
  const user = await requirePage(["SALES_REP", "SUPER_ADMIN"], "cash.manage");
  const ctx = await resolvePortalContext(user, searchParams.companyId);

  if (!ctx.companyId) {
    return (
      <div>
        <RepNav userName={user.name} permissions={user.permissions} current="/rep/tahsilat" showCompany />
        <CompanyPicker
          basePath="/rep/tahsilat"
          eyebrow="Tahsilat girilecek firma"
          subtitle="Tahsilat carinin defterine yazılır; hangi firma olduğu seçilmeden tutar girilemez."
        />
      </div>
    );
  }

  return (
    <div>
      <RepNav
        userName={user.name}
        permissions={user.permissions}
        current="/rep/tahsilat"
        companyId={ctx.companyId}
        companyName={ctx.companyName}
        showCompany
      />
      <div className="mx-auto max-w-4xl px-4 pb-10">
        <CollectionPanel
          companyId={ctx.companyId}
          companyName={ctx.companyName ?? "Firma"}
        />
      </div>
    </div>
  );
}
