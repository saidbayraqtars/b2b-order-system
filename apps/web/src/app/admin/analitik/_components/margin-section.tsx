"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { MarginRow, MarginSnapshot } from "@repo/services";
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
import { BarChart, Waterfall } from "@/components/charts";
import { Insufficient, NoValue, SourceTile } from "./shared";

// E. Kârlılık: liste bedelinden brüt kâra köprü, aylık marj, üç kırılım.
//
// Ürün bölümünün ABC tablosu da marj gösteriyor ama **ürün** başına; bu bölüm
// aynı soruyu paranın kendisine soruyor: liste bedelinin ne kadarı iskontoya,
// ne kadarı maliyete gitti, geriye ne kaldı. İkisi ayrı bölüm çünkü "hangi
// ürün kârlı" ile "kâr nerede eridi" ayrı kararlar doğuruyor — birincisi
// kataloğu değiştiriyor, ikincisi iskonto politikasını.

export function MarginSection({ data }: { data: MarginSnapshot }) {
  const b = data.bridge;
  const window = data.windowDays === 365 ? "son 12 ay" : `son ${data.windowDays} gün`;

  const trend = data.trend.filter((t) => t.marginPct !== null);
  const trendHidden = data.trend.length - trend.length;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SourceTile
          label="Brüt marj"
          value={
            b.grossMarginPct.ok ? (
              `%${b.grossMarginPct.value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
            ) : (
              <NoValue />
            )
          }
          tone={
            b.grossMarginPct.ok && b.grossMarginPct.value < 10
              ? "critical"
              : "neutral"
          }
          hint={
            b.grossMarginPct.ok
              ? `${window}, net mal bedeli üzerinden`
              : b.grossMarginPct.reason
          }
        />
        <SourceTile
          label="Brüt kâr"
          // Kapsam yetmiyorsa tutar da yazılmıyor, yüzde gibi: maliyeti boş
          // satırın kârı kendi cirosu kadar görünüyor ve toplam o kadar şişiyor.
          value={
            b.grossMarginPct.ok ? formatTRY(b.grossProfit) : <NoValue />
          }
          hint={
            b.grossMarginPct.ok
              ? `net ciro ${formatTRY(b.netRevenue)} − maliyet ${formatTRY(b.cost)}`
              : "maliyet kapsamı yetmiyor"
          }
        />
        <SourceTile
          label="İskonto oranı"
          value={
            b.discountSharePct === null ? (
              <NoValue label="satış yok" />
            ) : (
              `%${b.discountSharePct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
            )
          }
          tone={
            b.discountSharePct !== null && b.discountSharePct > 20
              ? "caution"
              : "neutral"
          }
          hint={`liste bedelinden ${formatTRY(b.discountTotal)} iskonto verildi`}
        />
        <SourceTile
          label="Maliyet kapsamı"
          value={
            b.costCoveragePct === null ? (
              <NoValue label="satış yok" />
            ) : (
              `%${Math.round(b.costCoveragePct)}`
            )
          }
          tone={
            b.costCoveragePct !== null && b.costCoveragePct < 60
              ? "caution"
              : "positive"
          }
          hint="cironun bu kadarında alış fiyatı girili; altında marj yazılmıyor"
          href="/admin/products"
          sourceLabel="Ürün listesi"
        />
      </section>

      <Panel title={`Marj köprüsü · ${window}`}>
        <Waterfall
          start={{ label: "Liste bedeli", value: b.listValue }}
          steps={[
            ...b.steps.map((s) => ({
              label: s.label,
              delta: -s.amount,
              hint:
                s.sharePct === null
                  ? undefined
                  : `liste bedelinin %${s.sharePct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kadarı`,
            })),
            {
              label: "Satılan malın maliyeti",
              delta: -b.cost,
              hint: "alış fiyatı × satılan adet",
            },
          ]}
          end={{ label: "Brüt kâr", value: b.grossProfit }}
          format={formatTRY}
        />
        <Note className="mt-6">
          Üç iskonto kalemi ayrı duruyor çünkü{" "}
          <strong>üçünün sahibi ayrı</strong>: firma iskontosu bir anlaşma,
          hacim iskontosu bir kural, kampanya bir karar. Hangisinin pahalı
          olduğu görülmeden hiçbiri kısılamaz. Buradaki sayılar KDV ve navlun
          hariç <strong>mal bedeli</strong>; panonun ciro kutuları KDV dahil
          genel toplamı sayıyor, ikisi bilerek farklı — marjın paydası mal
          bedeli olmak zorunda, yoksa KDV oranı marjı değiştirir.
        </Note>
      </Panel>

      <Panel title="Aylık kârlılık">
        {trend.length === 0 ? (
          <Insufficient
            of={{
              ok: false,
              need: 1,
              have: 0,
              unit: "ay",
              reason:
                "hiçbir ayda maliyet kapsamı marj yazmaya yetmedi — alış fiyatları girildikçe dolacak",
            }}
          />
        ) : (
          <>
            {/* Sütunlar **tutar**, yüzde değil: marj yüzdesi %38 ile %42
                arasında gezinirken sıfır tabanlı bir sütun grafiğinde bütün
                aylar aynı boyda çıkıyor (ilk denemede tam bunu yaptı) ve
                grafik hiçbir şey söylemiyor. Yüzdenin yeri altındaki tablo. */}
            <BarChart
              points={trend.map((t) => ({
                label: t.month,
                value: t.netRevenue - t.cost,
                title: `${t.month}: brüt kâr ${formatTRY(t.netRevenue - t.cost)} · marj %${t.marginPct!.toFixed(1)}`,
              }))}
              format={formatTRY}
              height="h-44"
            />
            <div className="mt-4 overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <Th>Ay</Th>
                    <Th align="right">Net ciro</Th>
                    <Th align="right">Maliyet</Th>
                    <Th align="right">Brüt kâr</Th>
                    <Th align="right">Marj</Th>
                  </tr>
                </THead>
                <TBody>
                  {[...trend].reverse().map((t) => (
                    <tr key={t.month}>
                      <Td>{t.month}</Td>
                      <Td align="right" numeric>
                        {formatTRY(t.netRevenue)}
                      </Td>
                      <Td align="right" numeric muted>
                        {formatTRY(t.cost)}
                      </Td>
                      <Td align="right" numeric muted>
                        {formatTRY(t.netRevenue - t.cost)}
                      </Td>
                      <Td align="right" numeric>
                        %{t.marginPct!.toFixed(1)}
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </Table>
            </div>
            {trendHidden > 0 && (
              <p className="mt-2 text-xs text-ink-faint">
                {trendHidden} ay listede yok: o aylarda cironun yeterli
                kısmında alış fiyatı yoktu ve maliyetsiz satır marjı yukarı
                şişirir.
              </p>
            )}
          </>
        )}
      </Panel>

      <Ranking
        title="Firma bazında kârlılık"
        head="Firma"
        unitLabel="firma"
        ranking={data.byCompany}
        href={(key) => `/admin/companies/${key}`}
      />

      <Ranking
        title="Kategori bazında kârlılık"
        head="Kategori"
        unitLabel="kategori"
        ranking={data.byCategory}
      />

      <Ranking
        title="Plasiyer bazında kârlılık"
        head="Plasiyer"
        unitLabel="plasiyer"
        ranking={data.byRep}
        note={
          <>
            Yalnızca <strong>plasiyerin girdiği</strong> siparişler: bayinin
            portaldan kendi geçtiği sipariş kimsenin performansı değil. İskonto
            sütunu satışın masada ne bıraktığını gösteriyor — prim hesabı bunu
            görmüyor, o ciroya bakıyor.
          </>
        }
      />
    </div>
  );
}

/**
 * Üç kırılım da aynı tablo.
 *
 * Sıralama **marj yüzdesine** göre, azalan. Tutar da satırda ama sıralamıyor:
 * büyük müşteri her zaman kârlı müşteri değil ve tabloyu tutara göre dizmek
 * tam olarak o yanılgıyı üretiyor.
 */
function Ranking({
  title,
  head,
  ranking,
  href,
  unitLabel,
  note,
}: {
  title: string;
  head: string;
  ranking: { rows: MarginRow[]; excluded: number };
  href?: (key: string) => string;
  unitLabel: string;
  note?: ReactNode;
}) {
  return (
    <Panel title={title} bodyClassName="p-0 pb-1">
      <Table stickyHead>
        <THead>
          <tr>
            <Th>{head}</Th>
            <Th align="right">Net ciro</Th>
            <Th align="right">İskonto</Th>
            <Th align="right">Brüt kâr</Th>
            <Th align="right">Marj</Th>
            <Th align="right">Sipariş</Th>
          </tr>
        </THead>
        <TBody>
          {ranking.rows.slice(0, 25).map((r) => (
            <tr key={r.key}>
              <Td>
                {href ? (
                  <Link
                    href={href(r.key)}
                    className="font-medium text-ink hover:underline"
                  >
                    {r.label}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{r.label}</span>
                )}
              </Td>
              <Td align="right" numeric>
                {formatTRY(r.netRevenue)}
              </Td>
              <Td align="right" numeric muted>
                {r.discountPct === null ? "—" : `%${r.discountPct.toFixed(1)}`}
              </Td>
              <Td align="right" numeric muted>
                {/* Kapsam yoksa tutar da yok: maliyeti girilmemiş bir satırın
                    "brüt kârı" kendi cirosuna eşit çıkıyor ve o rakam yalandır. */}
                {r.marginPct === null ? "—" : formatTRY(r.grossProfit)}
              </Td>
              <Td
                align="right"
                numeric
                className={
                  r.marginPct === null
                    ? "text-ink-faint"
                    : r.marginPct < 10
                      ? "text-critical"
                      : ""
                }
              >
                {r.marginPct === null
                  ? "kapsam yok"
                  : `%${r.marginPct.toFixed(1)}`}
              </Td>
              <Td align="right" numeric muted>
                {r.orderCount}
              </Td>
            </tr>
          ))}
          {ranking.rows.length === 0 && (
            <TableEmpty
              colSpan={6}
              label={`Sıralamaya girecek ${unitLabel} yok.`}
            />
          )}
        </TBody>
      </Table>
      {(ranking.excluded > 0 || note) && (
        <div className="space-y-2 px-4 py-3 text-xs text-ink-faint">
          {ranking.excluded > 0 && (
            <p>
              {ranking.excluded} {unitLabel} sıralamaya girmedi: üçten az
              siparişte marj, kârlılığı değil o siparişin kampanyasını
              ölçer.
            </p>
          )}
          {note && <p>{note}</p>}
        </div>
      )}
    </Panel>
  );
}
