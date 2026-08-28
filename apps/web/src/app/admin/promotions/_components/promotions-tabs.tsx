"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Note, Tabs } from "@/components/ui";
import { PromotionsManager } from "./promotions-manager";
import { PromotionSimulator } from "./promotion-simulator";

// İki sekme: kampanyanın **tanımı** ve **ne yapacağı**.
//
// Simülatör ayrı bir sayfaya konmadı: oranı yazan kişi sonucunu aynı ekranda
// görebilmeli, ve iki adres arasında gidip gelmek o bağı koparırdı. Sekme
// `?bolum=` ile adreste — betik düğmeye basmıyor.

const TABS = [
  { key: "tanimlar" as const, label: "Tanımlar" },
  { key: "simulasyon" as const, label: "Simülasyon" },
];

type TabKey = (typeof TABS)[number]["key"];

export function PromotionsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: TabKey =
    params.get("bolum") === "simulasyon" ? "simulasyon" : "tanimlar";

  return (
    <>
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(next) => {
            // Simülasyonun kendi süzgeçleri de adreste; sekme değişince
            // onları taşımıyoruz, çünkü tanımlar sekmesinde anlamları yok.
            router.replace(`${pathname}?bolum=${next}`, { scroll: false });
          }}
          items={TABS}
        />
      </div>

      {tab === "simulasyon" ? (
        <>
          <PromotionSimulator />
          <Note>
            Simülasyon kampanyayı <strong>geçmiş siparişlerde kuru kuruya</strong>{" "}
            çalıştırır: hiçbir şey yazılmaz, sipariş tutarları değişmez.
            Kotalar zaman sırasında tükenir — kullanım limiti olan bir kampanya
            gerçekte de ilk gelen siparişlere uygulanırdı.
            <br />
            <br />
            Satır neti kampanya öncesine <strong>geri sarılır</strong>: kayıtlı
            kampanyanın indirimi geri eklenip motor öyle çalıştırılır, yani
            sonuç &ldquo;bu kampanya <em>tek başına</em> ne verirdi&rdquo;
            sorusunun cevabıdır. Aynı anda çalışacak iki kampanyanın birleşik
            etkisi bundan farklı olur.
          </Note>
        </>
      ) : (
        <>
          <PromotionsManager />
          <Note>
            Kampanya kod değil veri: koşullar ve aksiyonlar sunucudaki kural
            kayıt defterinden seçilir. İndirim, grup fiyatı ve firma
            iskontosunun üzerine uygulanır; KDV kampanya sonrası net tutardan
            hesaplanır. Öncelik sırasıyla çalışır, her kampanya bir öncekinin
            bıraktığı tutarı görür.
          </Note>
        </>
      )}
    </>
  );
}
