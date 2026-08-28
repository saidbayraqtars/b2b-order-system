"use client";

import type { LiveStatus } from "@repo/services";
import { formatTRY } from "@/lib/format";
import { Note } from "@/components/ui";
import { NoValue, SourceTile } from "./shared";

// A. Anlık durum — hepsi canlı sorgudan.
//
// Her kutu kaynağına bağlı (§6.4/4): tıklanınca sayıyı üreten listeye
// gidiyor. Bağlantısı olmayan üç kutu var ve onlar bilerek düz: karşılığı olan
// bir liste ekranı yok, ve tıklanabilir görünüp hiçbir yere gitmeyen bir kutu
// hiç bağlantısı olmayandan kötü.

export function LiveSection({ data }: { data: LiveStatus }) {
  const yoy = data.yoyChangePct;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SourceTile
          label="Bu ay ciro"
          value={formatTRY(data.monthRevenue)}
          tone={yoy === null ? "neutral" : yoy >= 0 ? "positive" : "critical"}
          hint={
            yoy === null ? (
              "geçen yıl aynı ay verisi yok"
            ) : (
              <>
                geçen yıl aynı ay {formatTRY(data.lastYearSameMonthRevenue ?? 0)}{" "}
                · {yoy >= 0 ? "+" : ""}
                {yoy.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%
              </>
            )
          }
          href="/admin/reports?bolum=satis"
          sourceLabel="Satış raporu"
        />
        <SourceTile
          label="Açık sipariş"
          value={data.openOrderCount}
          hint={`${data.awaitingShipmentCount} tanesi sevk bekliyor`}
          href="/admin"
          sourceLabel="Sipariş listesi"
        />
        <SourceTile
          label="Toplam alacak"
          value={formatTRY(data.receivableTotal)}
          tone={data.overdueTotal > 0 ? "critical" : "neutral"}
          hint={
            data.overdueTotal > 0
              ? `${formatTRY(data.overdueTotal)} vadesi geçmiş`
              : "vadesi geçmiş yok"
          }
          href="/admin/reports?bolum=alacak"
          sourceLabel="Alacak yaşlandırma"
        />
        <SourceTile
          label="Kasa & banka"
          value={formatTRY(data.cashTotal)}
          hint="aktif hesapların toplamı"
          href="/admin/kasa"
          sourceLabel="Kasa defteri"
        />
        <SourceTile
          label="Bu ay tahsil edilecek çek"
          value={formatTRY(data.chequesDueThisMonth)}
          hint="portföyde ve tahsildeki kâğıtlar"
          href="/admin/cekler"
          sourceLabel="Çek portföyü"
        />
        <SourceTile
          label="Stok değeri"
          value={formatTRY(data.stockValueAtCost)}
          hint="alış fiyatıyla"
          href="/admin/stok?bolum=durum"
          sourceLabel="Stok defteri"
        />
        <SourceTile
          label="Brüt marj"
          value={
            data.grossMarginPct === null ? (
              <NoValue label="hesaplanamıyor" />
            ) : (
              `%${data.grossMarginPct.toLocaleString("tr-TR", {
                maximumFractionDigits: 1,
              })}`
            )
          }
          tone={data.grossMarginPct === null ? "caution" : "neutral"}
          hint={
            data.grossMarginPct === null ? (
              <>
                maliyet kapsamı yetersiz (
                {data.costCoveragePct === null
                  ? "ciro yok"
                  : `%${data.costCoveragePct.toFixed(0)}`}
                )
              </>
            ) : (
              `bu ayın satılan mal maliyeti ${formatTRY(data.monthCogs)}`
            )
          }
        />
      </section>

      <Note>
        <strong>Marj neden boş olabilir?</strong> Alış fiyatı girilmemiş bir
        ürün sıfır maliyetli sayılır ve marjı yukarı şişirir. Bu yüzden marj
        yalnızca cironun en az <strong>%60</strong>&apos;ı maliyeti girilmiş
        üründen geliyorsa yazılıyor. Şu an{" "}
        <strong className="tabular-nums">{data.variantsWithoutCost}</strong>{" "}
        aktif varyantın alış fiyatı boş —{" "}
        <a
          href="/admin/products"
          className="underline underline-offset-4 hover:text-ink"
        >
          ürün kartlarından
        </a>{" "}
        doldurulabilir. Kasa ve stok değeri de bu sayıdan etkilenir.
      </Note>
    </div>
  );
}
