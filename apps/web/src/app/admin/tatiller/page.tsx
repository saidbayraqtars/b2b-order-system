import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { HolidayManager } from "./_components/holiday-manager";

export const dynamic = "force-dynamic";

/**
 * Resmî tatil takvimi (KALAN-ISLER §6.4).
 *
 * Tek tüketicisi ay sonu projeksiyonu: iş günü sayacı bugüne kadar yalnızca
 * hafta sonunu biliyordu, bayram ayında dokuz tatil gününü çalışılmış sayıp
 * tahmini yukarı çekiyordu.
 *
 * İzin `organization.manage`, `analytics.view` değil: takvim bir kuruluş
 * ayarı. Panoyu okuyan ile takvimi kuran aynı kişi olmak zorunda değil.
 */
export default async function HolidaysPage() {
  await requirePage(["SUPER_ADMIN"], "organization.manage");

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Resmî tatiller"
        subtitle="Ay sonu tahmini iş gününe göre hesaplanır; bu takvim o sayacı besler"
      />
      <HolidayManager />
    </main>
  );
}
