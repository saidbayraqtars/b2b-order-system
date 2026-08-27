import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { TiersManager } from "./_components/tiers-manager";

export default async function AdminVolumeTiersPage() {
  await requirePage(["SUPER_ADMIN"], "volume_tiers.manage");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Hacim iskontosu"
        subtitle="Cirosu büyüyen firmanın kendiliğinden hak ettiği oran"
      />
      <TiersManager />
      <Note>
        Bu merdiven <strong>herkese aynı</strong> tekliftir: her firma, kendi
        cirosuyla hak ettiği en yüksek oranı otomatik alır. Tek bir cariye özel
        oran vermek isterseniz basamak değil, firma sayfasındaki{" "}
        <strong>iskonto</strong> tanımını kullanın. Ciro; KDV ve navlun hariç,
        iptal ve reddedilen siparişler sayılmadan hesaplanır. Oran, firmanın
        kendi iskontosunun <strong>üstüne</strong> uygulanır — %20 sonra %5,
        toplamda %24 eder.
      </Note>
    </div>
  );
}
