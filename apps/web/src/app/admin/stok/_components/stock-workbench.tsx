"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Label, TextInput } from "@/components/form";
import { Note, PageHeader, Tabs } from "@/components/ui";
import { LotsPanel } from "./lots-panel";
import { MovementsPanel } from "./movements-panel";
import { StockLevelsPanel } from "./stock-levels-panel";
import {
  StockSourceBreakdown,
  StockSummaryTiles,
  monthStart,
  today,
  useStockSummary,
  type DateRange,
} from "./stock-summary-panel";
import { WarehousesPanel } from "./warehouses-panel";

// Stok defterinin tek ekranı.
//
// Beş panel önce alt alta duruyordu ve ikisi (stok durumu, hareketler) tek
// başına iki yüz satır çizebiliyor: sayfa üç bin pikseli aşınca alttaki depo
// paneline ve dipnota kimse ulaşmıyordu. Aynı hata Adım 4'te kasa ekranında da
// çıkmıştı. Paneller sekmeye alındı; dönemin üç sayısı sekmenin dışında, hep
// görünen yerde kaldı — hangi sekmede olursanız olun sorulan ilk soru "bu ay
// defter ne kadar oynadı".
//
// Sekme **URL'de** duruyor. Bileşen durumunda tutmak daha az kod olurdu ama o
// hâlde üç sekmenin ekran görüntüsü hiç alınamazdı: betik bir adrese gidip
// resmini çekiyor, düğmelere basmıyor. Fotoğraflanamayan ekran, doğru göründüğü
// söylenemeyen ekrandır. `replace` kullanılıyor — sekme gezinmesi tarayıcının
// geri düğmesini doldurmamalı.

type TabKey = "levels" | "lots" | "movements" | "warehouses";

const TABS = [
  { key: "levels" as const, label: "Stok durumu" },
  { key: "lots" as const, label: "Partiler" },
  { key: "movements" as const, label: "Hareketler" },
  { key: "warehouses" as const, label: "Depolar" },
];

/** URL'deki değer Türkçe: adres çubuğunda okunan şey ekrandaki sekmenin adı. */
const SLUG: Record<TabKey, string> = {
  levels: "durum",
  lots: "partiler",
  movements: "hareketler",
  warehouses: "depolar",
};

function tabFromSlug(slug: string | null): TabKey {
  const hit = (Object.keys(SLUG) as TabKey[]).find((k) => SLUG[k] === slug);
  return hit ?? "levels";
}

export function StockWorkbench() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = tabFromSlug(params.get("bolum"));

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [range, setRange] = useState<DateRange>({
    from: monthStart(),
    to: today(),
  });

  const summary = useStockSummary(range);

  return (
    <>
      <PageHeader
        title="Stok defteri"
        subtitle="Eldeki adet, partiler ve her hareketin sebebi"
      />

      {/* Aralık şeridi: gömük zemin, tablo başlığıyla aynı yüzey. Sayı
          kutularının hemen üstünde çünkü onları o tarihler belirliyor. */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-line bg-sunken p-3">
        <div>
          <Label htmlFor="stok-from">Başlangıç</Label>
          <TextInput
            id="stok-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="stok-to">Bitiş</Label>
          <TextInput
            id="stok-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
          />
        </div>
        <Button onClick={() => setRange({ from, to })}>Getir</Button>
      </div>

      <StockSummaryTiles query={summary} />

      <div className="mt-6 space-y-4">
        <Tabs
          value={tab}
          onChange={(next) =>
            router.replace(`${pathname}?bolum=${SLUG[next]}`, { scroll: false })
          }
          items={TABS}
        />

        {tab === "levels" && (
          <>
            <StockLevelsPanel />
            <Note>
              Eldeki adet <strong>bu defterin bakiyesi</strong>: her hareket onu
              farkı kadar oynatır, kimse üstüne yazmaz. Sipariş girildiği anda
              malı düşer — sevkte değil — yoksa aynı son kutu iki müşteriye
              satılırdı; iptal ve ret geri verir. Bir satırın{" "}
              <strong>Defter</strong> düğmesi, o sayının nereden geldiğini
              hareket hareket gösterir.
            </Note>
          </>
        )}
        {tab === "lots" && <LotsPanel />}
        {tab === "movements" && (
          <>
            <StockSourceBreakdown query={summary} />
            <MovementsPanel />
            <Note>
              <strong>ERP senkronu ezmez</strong>, farkı kadar hareket yazar —
              &ldquo;gece stok neden düştü&rdquo; sorusunun cevabı bu yüzden
              defterde durur. Kayıtlar silinmez: yanlış bir kayıt, kendisine
              bağlı ters kayıtla iptal edilir ve ikisi de listede kalır. Sipariş
              kaynaklı satırların iptal düğmesi yok; onların öbür yarısı
              siparişin kendisi, iptal oradan yapılır.
            </Note>
          </>
        )}
        {tab === "warehouses" && <WarehousesPanel />}
      </div>
    </>
  );
}
