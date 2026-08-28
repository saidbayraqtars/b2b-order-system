"use client";

import Link from "next/link";
import type { CustomerSnapshot } from "@repo/services";
// Etiketler `@repo/types`tan: `@repo/services`ten bir *değer* içe aktarmak
// nodemailer'ı istemci paketine sokuyor (bkz. packages/types/src/analytics.ts).
import {
  COHORT_WINDOW_LABELS,
  COHORT_WINDOW_OPTIONS,
  RFM_SEGMENT_LABELS,
  RFM_WINDOW_LABELS,
  RFM_WINDOW_OPTIONS,
  type CohortWindowMonths,
  type RfmSegment,
  type RfmWindowDays,
} from "@repo/types";
import { formatTRY } from "@/lib/format";
import { Panel } from "@/components/form";
import {
  Chips,
  EmptyState,
  Note,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { HeatCell, PieChart } from "@/components/charts";
import { Insufficient, SourceTile } from "./shared";

// C. Müşteri: RFM, kohort tutundurma, konsantrasyon riski, sessizleşenler.

export function CustomerSection({
  data,
  rfmWindow,
  cohortWindow,
  onWindowChange,
}: {
  data: CustomerSnapshot;
  rfmWindow: RfmWindowDays;
  cohortWindow: CohortWindowMonths;
  onWindowChange: (next: { rfm?: number; kohort?: number }) => void;
}) {
  const conc = data.concentration;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SourceTile
          label="Cironun %80'i"
          value={conc.companiesFor80Pct}
          hint="firmadan geliyor"
          href="/admin/companies"
          sourceLabel="Firma listesi"
        />
        <SourceTile
          label="En büyük müşteri"
          value={`%${conc.top1Pct.toFixed(1)}`}
          tone={conc.top1Pct > 25 ? "critical" : "neutral"}
          hint={
            conc.top1Pct > 25
              ? "tek müşteri cironun dörtte birinden fazlası"
              : "cirodaki payı"
          }
        />
        <SourceTile
          label="İlk beş"
          value={`%${conc.top5Pct.toFixed(1)}`}
          hint="cirodaki payları"
        />
        <SourceTile
          label="HHI"
          value={Math.round(conc.hhi)}
          tone={conc.hhi > 2500 ? "critical" : conc.hhi > 1500 ? "caution" : "neutral"}
          hint={
            conc.hhi > 2500
              ? "yoğunlaşmış — tek müşteri kaybı acıtır"
              : conc.hhi > 1500
                ? "orta yoğunluk"
                : "dağınık, sağlıklı"
          }
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel
          title="RFM segmentleri"
          action={
            <Chips
              value={String(rfmWindow)}
              onChange={(next) => onWindowChange({ rfm: Number(next) })}
              items={RFM_WINDOW_OPTIONS.map((d) => ({
                key: String(d),
                label: RFM_WINDOW_LABELS[d],
              }))}
            />
          }
        >
          {data.rfm.ok ? (
            <PieChart
              slices={Object.entries(data.segmentCounts).map(([key, count]) => ({
                label: RFM_SEGMENT_LABELS[key as RfmSegment] ?? key,
                value: count,
              }))}
              format={(v) => `${v} firma`}
            />
          ) : (
            <Insufficient of={data.rfm} />
          )}
          <Note className="mt-6">
            Sabit eşik yok: her boyut kurulumun kendi dağılımının çeyrekliğine
            göre puanlanıyor. &ldquo;90 günden eskiyse riskli&rdquo; gibi bir
            eşik, haftalık alan bayi ile mevsimlik alan bayiyi aynı kefeye
            koyardı. <strong>Pencere segmenti değiştirir</strong>: bir yıllık
            pencerede &ldquo;sadık&rdquo; görünen firma, 90 günlük pencerede
            hiç alışveriş yapmadıysa listeye bile girmez — soru
            &ldquo;kim iyi müşteri&rdquo; değil, &ldquo;hangi dönemde&rdquo;.
          </Note>
        </Panel>

        <Panel title="Konsantrasyon — en büyük müşteriler" bodyClassName="p-0 pb-1">
          <Table>
            <THead>
              <tr>
                <Th>Firma</Th>
                <Th align="right">Ciro</Th>
                <Th align="right">Pay</Th>
              </tr>
            </THead>
            <TBody>
              {data.topCompanies.map((c) => (
                <tr key={c.companyId}>
                  <Td>
                    <Link
                      href={`/admin/companies/${c.companyId}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {c.companyName}
                    </Link>
                  </Td>
                  <Td align="right" numeric>
                    {formatTRY(c.revenue)}
                  </Td>
                  <Td align="right" numeric muted>
                    %{((c.revenue / (conc.total || 1)) * 100).toFixed(1)}
                  </Td>
                </tr>
              ))}
              {data.topCompanies.length === 0 && (
                <TableEmpty
                  colSpan={3}
                  label={`Son ${rfmWindow} günde sipariş yok.`}
                />
              )}
            </TBody>
          </Table>
        </Panel>
      </div>

      <Panel
        title="Kohort tutundurma"
        action={
          <Chips
            value={String(cohortWindow)}
            onChange={(next) => onWindowChange({ kohort: Number(next) })}
            items={COHORT_WINDOW_OPTIONS.map((m) => ({
              key: String(m),
              label: COHORT_WINDOW_LABELS[m],
            }))}
          />
        }
      >
        {data.cohorts.length === 0 ? (
          <EmptyState label="Kohort çıkaracak kadar sipariş geçmişi yok." />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-left text-body-sm">
              <thead className="border-y border-line bg-sunken text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">İlk ay</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Firma</th>
                  {Array.from(
                    { length: Math.max(...data.cohorts.map((c) => c.retention.length)) },
                    (_, i) => (
                      <th key={i} className="px-2 py-2 text-center">
                        +{i}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink">
                      {c.cohort}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-faint">
                      {c.size}
                    </td>
                    {c.retention.map((r, i) => (
                      <td key={i} className="px-1 py-1.5">
                        <HeatCell ratio={r}>
                          {r === null ? "—" : `%${Math.round(r * 100)}`}
                        </HeatCell>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note className="mt-6">
          Satır: ilk siparişini o ayda veren firmalar. Sütun: o aydan kaç ay
          sonra. Hücre: o kohortun yüzde kaçı hâlâ alıyor. İlk sütun her zaman
          %100 — tanım gereği. Pencere yalnızca <strong>kaç kohort</strong>{" "}
          gösterileceğini değiştirir; bir firmanın hangi kohorta düştüğü ilk
          siparişiyle belirlenir ve pencereyle oynamaz.
        </Note>
      </Panel>

      <Panel title={`Sessizleşen müşteriler (${data.quiet.length})`} bodyClassName="p-0 pb-1">
        <Table>
          <THead>
            <tr>
              <Th>Firma</Th>
              <Th align="right">Normal periyot</Th>
              <Th align="right">Son sipariş</Th>
              <Th align="right">Gecikme</Th>
            </tr>
          </THead>
          <TBody>
            {data.quiet.slice(0, 20).map((q) => (
              <tr key={q.companyId}>
                <Td>
                  <Link
                    href={`/admin/companies/${q.companyId}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {q.companyName}
                  </Link>
                </Td>
                <Td align="right" numeric muted>
                  {q.expectedEveryDays} günde bir
                </Td>
                <Td align="right" numeric muted>
                  {q.lastOrderAt
                    ? new Date(q.lastOrderAt).toLocaleDateString("tr-TR")
                    : "—"}
                </Td>
                <Td align="right" numeric className="font-medium text-critical">
                  +{q.overdueDays} gün
                </Td>
              </tr>
            ))}
            {data.quiet.length === 0 && (
              <TableEmpty
                colSpan={4}
                label="Kendi periyodunun iki katını aşan müşteri yok."
              />
            )}
          </TBody>
        </Table>
        <Note className="mx-4">
          Eşik <strong>sabit 90 gün değil</strong>: her firmanın kendi normal
          sipariş periyodunun iki katı. Haftada bir alan bayi için 30 gün zaten
          alarmdır, mevsimlik alan için değildir — sabit eşik ikisini de yanlış
          bildirir. Üç siparişten az geçmişi olan firma hesaba girmiyor: bir
          siparişten periyot çıkmaz.
        </Note>
      </Panel>
    </div>
  );
}
