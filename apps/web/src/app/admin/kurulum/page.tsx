import { getSetupStatus, listSetupPacks } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
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
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Kurulum"
        subtitle="Yeni bir kurulumun sırası — her adımın durumu canlı okunuyor"
      />
      <SetupWizard status={status} packs={packs} />
      <Note>
        Sıra rastgele değil: kategorisiz ürün açılmaz, fiyatsız varyant sipariş
        edilemez, grubu olmayan firma liste fiyatı görür. Hiçbir yerde
        &ldquo;tamamlandı&rdquo; kutucuğu tutulmuyor — tutulsaydı son firmayı
        silen kişiye sistem hâlâ &ldquo;hazır&rdquo; derdi. Paket, bu iskeletin
        tekrar eden kısmını kurar; ürün, fiyat ve müşteri her firmada başka
        olduğu için pakete girmiyor. Yedek dosyası yerine kod olmasının sebebi
        de bu: yedek alındığı günün şemasına aittir, bir sonraki sürümde
        yüklenmez — paket ise göçlerle birlikte güncellenir.
      </Note>
    </main>
  );
}
