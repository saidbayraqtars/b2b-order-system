import { getSetupStatus, listSetupPacks } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { SetupWizard } from "./_components/setup-wizard";

// Kurulum sihirbazı.
//
// Durum sunucuda okunuyor, istemciye hazır geçiyor: ekran açılır açılmaz doğru
// görünsün, boş bir listeyle bir an "her şey eksik" demesin.

export default async function AdminKurulumPage() {
  await requirePage(["SUPER_ADMIN"], "organization.manage");

  const status = await getSetupStatus();
  const packs = listSetupPacks();

  return (
    <div>
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-xl font-bold">Kurulum</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Yeni bir kurulumun sırası. Her adımın durumu <strong>canlı</strong>{" "}
            okunuyor — bir yerde &ldquo;tamamlandı&rdquo; kutucuğu tutulmuyor, o
            yüzden sonradan silinen bir kayıt adımı kendiliğinden geri açar.
          </p>
        </div>

        <SetupWizard status={status} packs={packs} />

        <p className="text-sm text-neutral-500">
          Sıra rastgele değil: kategorisiz ürün açılmaz, fiyatsız varyant
          sipariş edilemez, grubu olmayan firma liste fiyatı görür. Paket, bu
          iskeletin tekrar eden kısmını kurar; ürün, fiyat ve müşteri her
          firmada başka olduğu için pakete girmiyor. Yedek dosyası yerine kod
          olmasının sebebi de bu: yedek alındığı günün şemasına aittir, bir
          sonraki sürümde yüklenmez — paket ise göçlerle birlikte güncellenir.
        </p>
      </main>
    </div>
  );
}
