import { requirePage } from "@/lib/guard";
import { TiersManager } from "./_components/tiers-manager";

export default async function AdminVolumeTiersPage() {
  await requirePage(["SUPER_ADMIN"], "volume_tiers.manage");

  return (
    <div>
      <main className="mx-auto max-w-4xl px-4 pb-6">
        <h1 className="mb-5 text-xl font-bold">Hacim İskontosu</h1>
        <TiersManager />
        <p className="mt-4 text-sm text-neutral-500">
          Bu merdiven <strong>herkese aynı</strong> tekliftir: her firma, kendi
          cirosuyla hak ettiği en yüksek oranı otomatik alır. Tek bir cariye özel
          oran vermek isterseniz basamak değil, firma sayfasındaki{" "}
          <strong>iskonto</strong> tanımını kullanın. Ciro; KDV ve navlun hariç,
          iptal ve reddedilen siparişler sayılmadan hesaplanır. Oran, firmanın
          kendi iskontosunun <strong>üstüne</strong> uygulanır — %20 sonra %5,
          toplamda %24 eder.
        </p>
      </main>
    </div>
  );
}
