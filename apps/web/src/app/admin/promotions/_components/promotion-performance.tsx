"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { PromotionPerformance as Payload } from "@repo/services";
import {
  PERFORMANCE_WINDOWS,
  PERFORMANCE_WINDOW_LABELS,
  parsePerformanceWindow,
} from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { ErrorLine, Panel } from "@/components/form";
import {
  Badge,
  Chips,
  LoadingState,
  Meter,
  Note,
  StatTile,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
  type BadgeTone,
} from "@/components/ui";

// Kampanya karnesi.
//
// Simülasyon sekmesinin aynadaki hâli: o kampanyayı açmadan önce ne olacağını
// söylüyor, bu açtıktan sonra ne olduğunu.
//
// Ekranın en önemli işi bir sayıyı **göstermemek**: "kampanyanın getirdiği
// ciro" diye bir kolon yok. Kampanyalı siparişlerin cirosu var, ve o siparişin
// kampanya olmasaydı gelmeyeceğini kimse bilmiyor. Bu ayrımın kaybolduğu bir
// pano, iskontoyu kâr gibi gösterir.

const STATUS_LABEL = {
  aktif: "Aktif",
  bekliyor: "Bekliyor",
  bitti: "Bitti",
  kapali: "Kapalı",
} as const;

const STATUS_TONE: Record<keyof typeof STATUS_LABEL, BadgeTone> = {
  aktif: "success",
  bekliyor: "info",
  bitti: "neutral",
  kapali: "neutral",
};

function money(value: string | null): string {
  return value === null ? "—" : formatTRY(Number(value));
}

function pct(value: number | null): string {
  return value === null ? "—" : `%${value.toFixed(1)}`;
}

export function PromotionPerformance() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Pencere adreste: sekmeyle aynı kural, aynı sebep — betik düğmelere
  // basmıyor, fotoğraflanamayan ekranın doğru göründüğü söylenemez.
  const range = parsePerformanceWindow(params.get("pencere"));

  const query = useQuery({
    queryKey: ["promotion-performance", range],
    queryFn: () =>
      apiGet<Payload>(`/api/admin/promotions/performance?pencere=${range}`),
  });

  function setRange(next: string) {
    const q = new URLSearchParams(params.toString());
    q.set("bolum", "performans");
    q.set("pencere", next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorLine error={query.error} />;

  const data = query.data!;
  const used = data.rows.filter((r) => r.redemptions > 0);
  // Uzun liste 50 satırda kesiliyor (tasarım kuralı): kırpma sınırı sessizce
  // kesmesin, kaç satır gösterildiği altta yazsın. Üstteki kutular **bütün**
  // kampanyaları sayıyor, yalnızca gösterilenleri değil.
  const shown = data.rows.slice(0, 50);
  const givenPct =
    Number(data.revenueInWindow) > 0
      ? (Number(data.discountTotal) / Number(data.revenueInWindow)) * 100
      : null;

  return (
    <div className="space-y-4">
      <Chips
        value={range}
        onChange={setRange}
        items={PERFORMANCE_WINDOWS.map((w) => ({
          key: w,
          label: PERFORMANCE_WINDOW_LABELS[w],
        }))}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Verilen iskonto"
          value={money(data.discountTotal)}
          hint={
            givenPct === null
              ? "aralıkta ciro yok"
              : `aralıktaki cironun %${givenPct.toFixed(1)}'i`
          }
          tone={givenPct !== null && givenPct > 10 ? "caution" : "neutral"}
        />
        <StatTile
          label="Kampanyalı sipariş"
          value={used.reduce((n, r) => n + r.redemptions, 0)}
          hint={`aralıktaki ${data.ordersInWindow} siparişin içinde`}
        />
        <StatTile
          label="Kampanyalı ortalama sepet"
          value={money(averageOf(used))}
          hint="kampanya uygulanan siparişlerin ortalaması"
        />
        <StatTile
          label="Kampanyasız ortalama sepet"
          value={money(data.baselineAvgOrderValue)}
          hint={
            data.baselineAvgOrderValue === null
              ? "karşılaştırmaya yetecek sipariş yok"
              : "aynı aralık, kampanya görmemiş siparişler"
          }
        />
      </section>

      <Panel title="Kampanya karnesi" bodyClassName="p-0">
        <Table>
          <THead>
            <tr>
              <Th>Kampanya</Th>
              <Th>Durum</Th>
              <Th align="right">Kullanım</Th>
              <Th align="right">Firma</Th>
              <Th align="right">İskonto</Th>
              <Th align="right">Sipariş cirosu</Th>
              <Th align="right">İskonto payı</Th>
              <Th align="right">Ort. sepet</Th>
              <Th align="right">Yeni firma</Th>
              <Th align="right">Geri gelen</Th>
              <Th>Kota</Th>
            </tr>
          </THead>
          <TBody>
            {shown.map((r) => (
              <tr key={r.promotionId}>
                <Td>
                  <span className="font-medium text-ink">{r.name}</span>
                  {r.code && (
                    <span className="ml-2 font-mono text-xs text-ink-faint">
                      {r.code}
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </Td>
                <Td align="right" numeric>
                  {r.redemptions}
                </Td>
                <Td align="right" numeric muted>
                  {r.companies}
                </Td>
                <Td align="right" numeric>
                  {money(r.discountTotal)}
                </Td>
                <Td align="right" numeric muted>
                  {money(r.revenueOnOrders)}
                </Td>
                <Td
                  align="right"
                  numeric
                  className={
                    r.discountSharePct !== null && r.discountSharePct > 15
                      ? "font-medium text-critical"
                      : undefined
                  }
                >
                  {pct(r.discountSharePct)}
                </Td>
                <Td align="right" numeric muted>
                  {money(r.avgOrderValue)}
                </Td>
                <Td align="right" numeric muted>
                  {r.firstOrderCompanies}
                </Td>
                <Td align="right" numeric muted>
                  {r.returnedCompanies}
                </Td>
                <Td>
                  {r.quotaUsedPct === null ? (
                    <span className="text-ink-faint">sınırsız</span>
                  ) : (
                    <div className="w-24">
                      <Meter
                        value={Math.min(r.quotaUsedPct, 100)}
                        tone={r.quotaUsedPct >= 90 ? "caution" : "neutral"}
                        label={`${r.redemptions} / ${r.usageLimit}`}
                      />
                    </div>
                  )}
                </Td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <TableEmpty colSpan={11} label="Tanımlı kampanya yok." />
            )}
          </TBody>
        </Table>
        {data.rows.length > shown.length && (
          <p className="px-4 py-3 text-xs text-ink-faint">
            {data.rows.length} kampanyanın ilk {shown.length} tanesi
            gösteriliyor — sıra: önce açık olanlar, sonra öncelik.
          </p>
        )}
      </Panel>

      <Note>
        <strong>&ldquo;Kampanyanın getirdiği ciro&rdquo; diye bir kolon yok</strong>
        , çünkü öyle bir sayı ölçülmedi. &ldquo;Sipariş cirosu&rdquo;, kampanyanın
        uygulandığı siparişlerin toplamı; o siparişlerin çoğu kampanya olmasaydı
        da gelirdi. Artımlı etkiyi ölçmek kontrol grubu ister — kampanyayı
        müşterilerin yarısına kapatmak — ve burada öyle bir grup yok.
        <br />
        <br />
        Onun yerine <strong>aynı aralıktaki kampanyasız siparişlerin</strong>{" "}
        ortalama sepeti yan yana duruyor. Farklı dönemlerin ortalamasını
        kıyaslamak mevsimselliği kampanya etkisi sanmak olurdu.{" "}
        <strong>Beş siparişin altındaki</strong> kampanyanın ortalama sepeti
        yazılmıyor: o bir ortalama değil, gürültü.
        <br />
        <br />
        &ldquo;Yeni firma&rdquo;: ilk siparişi bu kampanyayla olan firmalar —
        ilk sipariş bütün geçmişe göre belirleniyor, pencereye göre değil.
        &ldquo;Geri gelen&rdquo;: kampanyayı ilk kullandıktan sonra yeniden
        sipariş veren firmalar; sonraki siparişin kampanyalı olup olmadığına
        bakılmıyor. İptal ve red hiçbir sayıya girmiyor, kotayı da geri
        veriyor.
      </Note>
    </div>
  );
}

/** Kampanyalı siparişlerin toplu ortalaması; hiç kullanım yoksa null. */
function averageOf(
  rows: ReadonlyArray<{ redemptions: number; revenueOnOrders: string }>,
): string | null {
  const orders = rows.reduce((n, r) => n + r.redemptions, 0);
  if (orders === 0) return null;
  const revenue = rows.reduce((n, r) => n + Number(r.revenueOnOrders), 0);
  return String(revenue / orders);
}
