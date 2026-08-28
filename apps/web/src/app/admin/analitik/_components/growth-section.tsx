"use client";

import type { GrowthSnapshot } from "@repo/services";
import { formatTRY } from "@/lib/format";
import { Panel } from "@/components/form";
import {
  Note,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { BarChart, Waterfall } from "@/components/charts";
import { Insufficient, NoValue, SourceTile } from "./shared";

// B. Büyüme.
//
// Karşılaştırma **yıl-üstü-yıl**, aydan aya değil: toptan gıdada MoM yanıltıcı
// (ramazan, yaz, okul dönemi) ve pano MoM'u hiç hesaplamıyor — gösterilseydi
// "mevsimsellik arındırılmamış" diye işaretlenmesi gerekirdi ve o uyarı
// okunmaz.

export function GrowthSection({ data }: { data: GrowthSnapshot }) {
  const points = data.months.map((m, i) => ({
    label: m.month,
    value: m.value,
    overlay: data.movingAverage[i]?.value ?? null,
    title: `${m.month}: ${formatTRY(m.value)}`,
  }));

  const bridge = data.bridge;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SourceTile
          label="Trend eğimi"
          value={
            data.slope.ok ? (
              `${data.slope.value >= 0 ? "+" : "−"}${formatTRY(Math.abs(data.slope.value))}`
            ) : (
              <NoValue />
            )
          }
          tone={data.slope.ok && data.slope.value < 0 ? "critical" : "neutral"}
          hint={
            data.slope.ok
              ? "aylık ortalama değişim (en küçük kareler)"
              : `en az ${data.slope.need} ay gerekiyor, ${data.slope.have} var`
          }
        />
        <SourceTile
          label="CAGR"
          value={
            data.cagr.ok ? (
              `%${data.cagr.value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
            ) : (
              <NoValue />
            )
          }
          hint={
            data.cagr.ok
              ? "bileşik yıllık büyüme"
              : (data.cagr.reason ??
                `en az ${data.cagr.need} ay gerekiyor, ${data.cagr.have} var`)
          }
        />
        <SourceTile
          label="Seride ay"
          value={data.months.length}
          hint="ilk satışın olduğu aydan bugüne"
        />
      </section>

      <Panel title="Aylık ciro ve 3 aylık hareketli ortalama">
        <BarChart points={points} format={formatTRY} height="h-52" />
        <p className="mt-2 text-xs text-ink-faint">
          Kesik çizgi hareketli ortalama: tek bir ayın gürültüsünü seriden
          ayırıyor. Pencere dolmadan çizilmiyor.
        </p>
      </Panel>

      <Panel title={`Ciro köprüsü · ${bridge.previousLabel} → ${bridge.currentLabel}`}>
        <Waterfall
          start={{ label: bridge.previousLabel, value: bridge.previousTotal }}
          steps={[
            {
              label: `Yeni müşteri (${bridge.counts.new})`,
              delta: bridge.newCustomers,
              hint: "önceki dönemde hiç almamış firmalar",
            },
            {
              label: `Kaybedilen (${bridge.counts.lost})`,
              delta: bridge.lostCustomers,
              hint: "önceki dönemde alıp bu dönemde hiç almayanlar",
            },
            {
              label: `Büyüyen (${bridge.counts.grown})`,
              delta: bridge.expansion,
              hint: "iki dönemde de alan, artıranlar",
            },
            {
              label: `Daralan (${bridge.counts.shrunk})`,
              delta: bridge.contraction,
              hint: "iki dönemde de alan, azaltanlar",
            },
          ]}
          end={{ label: bridge.currentLabel, value: bridge.currentTotal }}
          format={formatTRY}
        />
        <Note className="mt-6">
          <strong>Panonun en öğretici tek grafiği.</strong> Toplam ciro çizgisi
          &ldquo;büyüdük&rdquo; der; bu, <em>neden</em> büyüdüğünü söyler. Aynı
          artış yeni müşteriden geldiyse satışın işi, mevcut müşterinin daha çok
          almasından geldiyse hesabın işidir — ve arka planda kaç müşteri
          kaybedildiği ancak burada görünür.
        </Note>
      </Panel>

      <Panel title="Yıl-üstü-yıl" bodyClassName="p-0 pb-1">
        {data.yoy.every((r) => r.previous === null) ? (
          <div className="p-4">
            <Insufficient
              of={{ ok: false, need: 13, have: data.months.length, unit: "ay" }}
            />
          </div>
        ) : (
          <Table stickyHead>
            <THead>
              <tr>
                <Th>Ay</Th>
                <Th align="right">Bu yıl</Th>
                <Th align="right">Geçen yıl</Th>
                <Th align="right">Değişim</Th>
              </tr>
            </THead>
            <TBody>
              {[...data.yoy]
                .reverse()
                .filter((r) => r.previous !== null)
                .map((r) => (
                  <tr key={r.month}>
                    <Td>{r.month}</Td>
                    <Td align="right" numeric>
                      {formatTRY(r.value)}
                    </Td>
                    <Td align="right" numeric muted>
                      {formatTRY(r.previous!)}
                    </Td>
                    <Td
                      align="right"
                      numeric
                      className={
                        r.changePct === null
                          ? ""
                          : r.changePct >= 0
                            ? "text-positive"
                            : "text-critical"
                      }
                    >
                      {r.changePct === null
                        ? "—"
                        : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(1)}%`}
                    </Td>
                  </tr>
                ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
