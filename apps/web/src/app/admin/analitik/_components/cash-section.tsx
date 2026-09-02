"use client";

import Link from "next/link";
import type { CashSnapshot } from "@repo/services";
import { formatTRY } from "@/lib/format";
import { Panel } from "@/components/form";
import {
  Note,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { BarChart } from "@/components/charts";
import { NoValue, SourceTile } from "./shared";

// E. Nakit ve alacak: DSO, yaşlandırma trendi, tahsilat performansı, çek
// takvimi, karşılıksız oranı.

export function CashSection({ data }: { data: CashSnapshot }) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SourceTile
          label="DSO"
          value={
            data.dsoDays === null ? (
              <NoValue />
            ) : (
              `${Math.round(data.dsoDays)} gün`
            )
          }
          tone={data.dsoDays !== null && data.dsoDays > 90 ? "critical" : "neutral"}
          hint="alacağın tahsile dönme süresi"
          href="/admin/reports?bolum=alacak"
          sourceLabel="Alacak yaşlandırma"
        />
        <SourceTile
          label="Vadesi geçen payı"
          value={
            data.overdueSharePct === null ? (
              <NoValue />
            ) : (
              `%${data.overdueSharePct.toFixed(1)}`
            )
          }
          tone={
            data.overdueSharePct !== null && data.overdueSharePct > 30
              ? "critical"
              : "neutral"
          }
          hint="toplam alacağın içindeki payı"
        />
        <SourceTile
          label="Ortalama gecikme"
          value={
            data.averageDelayDays === null ? (
              <NoValue />
            ) : (
              `${Math.round(data.averageDelayDays)} gün`
            )
          }
          hint="yaklaşık — bkz. aşağıdaki not"
        />
        <SourceTile
          label="Karşılıksız oranı"
          value={
            data.bouncedPct === null ? (
              <NoValue label="örneklem küçük" />
            ) : (
              `%${data.bouncedPct.toFixed(1)}`
            )
          }
          tone={data.bouncedPct !== null && data.bouncedPct > 5 ? "critical" : "neutral"}
          hint={
            data.bouncedPct === null
              ? `${data.bouncedSample} kâğıt — oran için en az 10 gerekiyor`
              : "son bir yılın kâğıtları"
          }
          href="/admin/cekler"
          sourceLabel="Çek portföyü"
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title="Vadesi geçen borç — aylık">
          {data.agingTrend.length === 0 ? (
            <p className="text-body-sm text-ink-faint">Borç kaydı yok.</p>
          ) : (
            <BarChart
              points={data.agingTrend.map((a) => ({
                label: a.month,
                value: a.overdue,
                title: `${a.month}: ${formatTRY(a.overdue)} / ${formatTRY(a.total)}`,
              }))}
              format={formatTRY}
            />
          )}
          <p className="mt-2 text-xs text-ink-faint">
            Tek fotoğraf değil trend: yaşlandırma tablosu bugünü gösteriyor, bu
            grafik kötüleşip kötüleşmediğini.
          </p>
        </Panel>

        <Panel title="Çek vade takvimi — 90 gün">
          {data.chequeCalendar.length === 0 ? (
            <p className="text-body-sm text-ink-faint">
              Önümüzdeki 90 günde vadesi gelen kâğıt yok.
            </p>
          ) : (
            <BarChart
              points={data.chequeCalendar.map((c) => ({
                label: new Date(c.weekStart).toLocaleDateString("tr-TR", {
                  day: "2-digit",
                  month: "2-digit",
                }),
                value: c.amount,
                title: `${c.count} kâğıt · ${formatTRY(c.amount)}`,
              }))}
              format={formatTRY}
            />
          )}
          <p className="mt-2 text-xs text-ink-faint">
            Haftalık. Portföydeki ve tahsildeki kâğıtlar; tahsil edilmiş ya da
            karşılıksız çıkmışlar bu takvimde yok.
          </p>
        </Panel>
      </div>

      <Panel title="En geç ödeyen firmalar" bodyClassName="p-0 pb-1">
        <Table>
          <THead>
            <tr>
              <Th>Firma</Th>
              <Th align="right">Ortalama gecikme</Th>
              <Th align="right">Ödeme adedi</Th>
            </tr>
          </THead>
          <TBody>
            {data.slowPayers.map((s) => (
              <tr key={s.companyId}>
                <Td>
                  <Link
                    href={`/admin/companies/${s.companyId}/statement`}
                    className="font-medium text-ink hover:underline"
                  >
                    {s.companyName}
                  </Link>
                </Td>
                <Td
                  align="right"
                  numeric
                  className={
                    s.averageDelayDays > 30 ? "font-medium text-critical" : ""
                  }
                >
                  {s.averageDelayDays >= 0 ? "+" : ""}
                  {Math.round(s.averageDelayDays)} gün
                </Td>
                <Td align="right" numeric muted>
                  {s.paidCount}
                </Td>
              </tr>
            ))}
            {data.slowPayers.length === 0 && (
              <TableEmpty colSpan={3} label="Ölçülecek ödeme yok." />
            )}
          </TBody>
        </Table>
        <Note collapsible defaultOpen={false} className="mx-4">
          <strong>Bu sayı yaklaşık.</strong> Borç satırı ile onu kapatan
          tahsilat kuruşuna kadar eşlenmiyor — o işi ekstredeki FIFO mahsup
          yapıyor; burada her borcun vadesine en yakın tahsilata bakılıyor.
          Pano bir mutabakat belgesi değil, büyüklük sırası veren bir gösterge:
          kimin arkasından gitmek gerektiğini söyler, ne kadar borçlu olduğunu
          değil. Kesin rakam için firmanın{" "}
          <strong>cari ekstresine</strong> bakın.
        </Note>
      </Panel>
    </div>
  );
}
