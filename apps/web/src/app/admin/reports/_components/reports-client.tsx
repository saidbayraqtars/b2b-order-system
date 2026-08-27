"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type {
  CollectionsReport,
  ProductSales,
  ReceivablesReport,
  RepPerformance,
  SalesSummary,
} from "@repo/services";
import { PAYMENT_METHOD_LABELS, type OrderStatus } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import {
  LoadingState,
  Note,
  PageHeader,
  StatTile,
  Table,
  TableEmpty,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";

// Reporting dashboard. One shared date range drives every tab, so switching
// tabs compares the same window instead of silently changing it.
//
// Sekme URL'de duruyor (`?bolum=`), bileşen durumunda değil: ekran görüntüsü
// betiği bir adrese gidip resmini çekiyor, düğmelere basmıyor. Bileşen
// durumunda kalsaydı beş sekmenin dördü hiç fotoğraflanamazdı — stok
// defterinde verilen kararın aynısı.

type Tab = "sales" | "products" | "reps" | "collections" | "receivables";

const TABS: { key: Tab; label: string }[] = [
  { key: "sales", label: "Satış" },
  { key: "products", label: "Ürünler" },
  { key: "reps", label: "Plasiyerler" },
  { key: "collections", label: "Tahsilat" },
  { key: "receivables", label: "Alacak yaşlandırma" },
];

/** Adres çubuğunda okunan şey ekrandaki sekmenin adı. */
const SLUG: Record<Tab, string> = {
  sales: "satis",
  products: "urunler",
  reps: "plasiyerler",
  collections: "tahsilat",
  receivables: "alacak",
};

function tabFromSlug(slug: string | null): Tab {
  return (Object.keys(SLUG) as Tab[]).find((k) => SLUG[k] === slug) ?? "sales";
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay bekliyor",
  PENDING_CREDIT: "Kredi onayı bekliyor",
  CONFIRMED: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal",
  REJECTED: "Reddedildi",
};

// Reads through the enum's own map, plus the bucket the SQL uses for rows with
// no method. A local copy stopped at two members once, which left çek, nakit and
// havale showing as raw enum names in the reports.
const METHOD_LABEL: Record<string, string> = {
  ...PAYMENT_METHOD_LABELS,
  DIGER: "Diğer",
};

/** yyyy-mm-dd `n` days back, in local time — matches the report's day grouping. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function ReportsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = tabFromSlug(params.get("bolum"));

  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(daysAgo(0));

  const range = `from=${from}&to=${to}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hazır raporlar"
        subtitle="Satış, ürün, plasiyer, tahsilat ve alacak — tek tarih aralığıyla"
      />

      {/* Aralık şeridi: gömük zemin, tablo başlığıyla aynı yüzey. Sekmenin
          üstünde, çünkü beş sekmenin beşini de o tarihler belirliyor. */}
      <div className="flex flex-wrap items-end gap-3 rounded border border-line bg-sunken p-3">
        <div>
          <Label htmlFor="report-from">Başlangıç</Label>
          <TextInput
            id="report-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-44"
          />
        </div>
        <div>
          <Label htmlFor="report-to">Bitiş</Label>
          <TextInput
            id="report-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              [7, "Son 7 gün"],
              [29, "Son 30 gün"],
              [89, "Son 90 gün"],
            ] as const
          ).map(([n, label]) => (
            <Button
              key={label}
              variant="secondary"
              size="sm"
              onClick={() => {
                setFrom(daysAgo(n));
                setTo(daysAgo(0));
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(next) =>
          router.replace(`${pathname}?bolum=${SLUG[next]}`, { scroll: false })
        }
        items={TABS}
      />

      {tab === "sales" && <SalesTab range={range} />}
      {tab === "products" && <ProductsTab range={range} />}
      {tab === "reps" && <RepsTab range={range} />}
      {tab === "collections" && <CollectionsTab range={range} />}
      {tab === "receivables" && <ReceivablesTab />}
    </div>
  );
}

// ── Satış ──

function SalesTab({ range }: { range: string }) {
  const q = useQuery({
    queryKey: ["report", "sales", range],
    queryFn: () => apiGet<SalesSummary>(`/api/reports/sales?${range}`),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const d = q.data!;

  const peak = Math.max(1, ...d.daily.map((p) => Number(p.revenue)));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Ciro" value={formatTRY(d.revenue)} />
        <StatTile label="Sipariş" value={d.orderCount} />
        <StatTile
          label="Ortalama sepet"
          value={formatTRY(d.averageOrderValue)}
        />
        <StatTile
          label="Bekleyen"
          value={formatTRY(d.pendingTotal)}
          hint={`${d.pendingCount} sipariş`}
        />
      </div>

      {d.daily.length > 0 && (
        <Panel title="Günlük ciro">
          {/* Bars, not a chart library — one dependency saved for five lines of CSS. */}
          <div className="flex h-32 items-end gap-1">
            {d.daily.map((p) => (
              <div
                key={p.date}
                title={`${p.date}: ${formatTRY(p.revenue)} (${p.orderCount} sipariş)`}
                className="flex-1 rounded-t bg-ink/70 transition-colors hover:bg-ink"
                style={{
                  height: `${Math.max(4, (Number(p.revenue) / peak) * 100)}%`,
                }}
              />
            ))}
          </div>
          <p className="mt-2 flex justify-between text-xs text-ink-faint">
            <span>{d.daily[0]?.date}</span>
            <span>{d.daily[d.daily.length - 1]?.date}</span>
          </p>
        </Panel>
      )}

      {/* `items-start`: ızgara varsayılan olarak iki paneli aynı boya geriyor
          ve beş satırlık tablo, on satırlık komşusunun altında yarım ekran boş
          alan çiziyordu. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SummaryTable
          title="Duruma göre"
          head={["Durum", "Adet", "Tutar"]}
          rows={d.byStatus.map((s) => [
            STATUS_LABEL[s.status],
            String(s.orderCount),
            formatTRY(s.total),
          ])}
        />
        <SummaryTable
          title="En çok alan firmalar"
          head={["Firma", "Sipariş", "Ciro"]}
          rows={d.topCompanies.map((c) => [
            c.companyName,
            String(c.orderCount),
            formatTRY(c.revenue),
          ])}
        />
      </div>

      {d.lostCount > 0 && (
        <p className="text-body-sm text-ink-faint">
          Bu aralıkta {d.lostCount} sipariş iptal/red edildi ·{" "}
          {formatTRY(d.lostTotal)} — ciroya dahil değil.
        </p>
      )}
    </div>
  );
}

// ── Ürünler ──

function ProductsTab({ range }: { range: string }) {
  const q = useQuery({
    queryKey: ["report", "products", range],
    queryFn: () =>
      apiGet<{ products: ProductSales[] }>(`/api/reports/products?${range}`),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;

  return (
    <SummaryTable
      title="En çok satan ürünler"
      head={["Ürün", "SKU", "Adet", "Sipariş", "Ciro"]}
      rows={q.data!.products.map((p) => [
        p.productName,
        p.sku,
        String(p.quantity),
        String(p.orderCount),
        formatTRY(p.revenue),
      ])}
    />
  );
}

// ── Plasiyerler ──

function RepsTab({ range }: { range: string }) {
  const q = useQuery({
    queryKey: ["report", "reps", range],
    queryFn: () =>
      apiGet<{ reps: RepPerformance[] }>(`/api/reports/reps?${range}`),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;

  return (
    <SummaryTable
      title="Plasiyer performansı"
      head={[
        "Plasiyer",
        "Portföy",
        "Sipariş",
        "Ciro",
        "Kendi girdiği",
        "Tahsilat",
        "Ziyaret",
        "Portföy bakiyesi",
      ]}
      rows={q.data!.reps.map((r) => [
        r.name,
        String(r.portfolioCount),
        String(r.orderCount),
        formatTRY(r.revenue),
        String(r.ownOrderCount),
        `${formatTRY(r.collections)} (${r.collectionCount})`,
        String(r.visitCount),
        formatTRY(r.portfolioBalance),
      ])}
    />
  );
}

// ── Tahsilat ──

function CollectionsTab({ range }: { range: string }) {
  const q = useQuery({
    queryKey: ["report", "collections", range],
    queryFn: () =>
      apiGet<CollectionsReport>(`/api/reports/collections?${range}`),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const d = q.data!;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Toplam tahsilat" value={formatTRY(d.total)} />
        <StatTile label="Kayıt" value={d.count} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SummaryTable
          title="Ödeme yöntemine göre"
          head={["Yöntem", "Adet", "Tutar"]}
          rows={d.byMethod.map((m) => [
            METHOD_LABEL[m.paymentMethod] ?? m.paymentMethod,
            String(m.count),
            formatTRY(m.total),
          ])}
        />
        <SummaryTable
          title="Kaydeden"
          head={["Kullanıcı", "Adet", "Tutar"]}
          rows={d.byRep.map((r) => [
            r.name,
            String(r.count),
            formatTRY(r.total),
          ])}
        />
      </div>

      <SummaryTable
        title="Hareketler"
        head={["Tarih", "Firma", "Yöntem", "Kaydeden", "Tutar"]}
        rows={d.rows.map((r) => [
          new Date(r.createdAt).toLocaleString("tr-TR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          r.companyName,
          METHOD_LABEL[r.paymentMethod ?? "DIGER"] ?? "—",
          r.recordedByName ?? "—",
          formatTRY(r.amount),
        ])}
      />
    </div>
  );
}

// ── Alacak yaşlandırma ──

/** Yaşlandırma tablosunda gösterilen en fazla satır. */
const AGING_LIMIT = 50;

function ReceivablesTab() {
  const q = useQuery({
    queryKey: ["report", "receivables"],
    queryFn: () => apiGet<ReceivablesReport>("/api/reports/receivables"),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const d = q.data!;

  // Sunucu her aktif firmayı ada göre döndürüyor; ekranın sorusu ise "kim
  // borçlu". Bakiyesi sıfır olan firma o soruya cevap vermiyor ama satırı
  // kaplıyordu — gösterim verisinde otuz satırın on üçü sıfırdı. Sıralama
  // tutara göre, liste elli satırda kesiliyor: sunucu sayıyı sınırlamıyor ve
  // iki yüz müşterili bir kurulumda bu tablo sayfayı altı bin pikselin ötesine
  // taşırdı (Adım 5 ve 6'da üç kez çıkan hata).
  const owing = d.companies
    .filter((c) => Number(c.balance) !== 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance));
  const shown = owing.slice(0, AGING_LIMIT);
  const zeroCount = d.companies.length - owing.length;

  return (
    <div className="space-y-5">
      {/* Altı değil üç sütun: altı kutuya bölününce her biri 170 piksele
          düşüyor ve yedi haneli bir tutar 32 puntoyla oraya sığmıyor. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Toplam alacak" value={formatTRY(d.totals.balance)} />
        <StatTile
          label="Vadesi geçen"
          value={formatTRY(d.totals.overdue)}
          tone={Number(d.totals.overdue) > 0 ? "critical" : "neutral"}
          hint={Number(d.totals.overdue) > 0 ? "vadesi doldu" : undefined}
        />
        <StatTile label="1-30 gün" value={formatTRY(d.totals.d1_30)} />
        <StatTile label="31-60 gün" value={formatTRY(d.totals.d31_60)} />
        <StatTile label="61-90 gün" value={formatTRY(d.totals.d61_90)} />
        <StatTile
          label="90+ gün"
          value={formatTRY(d.totals.d90_plus)}
          tone={Number(d.totals.d90_plus) > 0 ? "critical" : "neutral"}
          hint={Number(d.totals.d90_plus) > 0 ? "takip gerekiyor" : undefined}
        />
      </div>

      <Panel title="Firma bazında yaşlandırma">
        <Table>
          <THead>
            <tr>
              <Th>Firma</Th>
              <Th>Plasiyer</Th>
              <Th align="right">Vadesi gelmemiş</Th>
              <Th align="right">1-30</Th>
              <Th align="right">31-60</Th>
              <Th align="right">61-90</Th>
              <Th align="right">90+</Th>
              <Th align="right">Bakiye</Th>
            </tr>
          </THead>
          <TBody>
            {shown.map((c) => (
              <tr key={c.companyId}>
                <Td>
                  <Link
                    href={`/admin/companies/${c.companyId}/statement`}
                    className="font-medium text-ink hover:underline"
                  >
                    {c.companyName}
                  </Link>
                </Td>
                <Td muted>{c.salesRepName ?? "—"}</Td>
                <Td align="right" numeric>
                  {formatTRY(c.buckets.current)}
                </Td>
                <Aged value={c.buckets.d1_30} />
                <Aged value={c.buckets.d31_60} />
                <Aged value={c.buckets.d61_90} />
                <Aged value={c.buckets.d90_plus} worst />
                <Td align="right" numeric className="font-medium">
                  {formatTRY(c.balance)}
                </Td>
              </tr>
            ))}
            {shown.length === 0 && (
              <TableEmpty colSpan={8} label="Bakiyesi olan firma yok." />
            )}
          </TBody>
        </Table>
        <p className="mt-3 text-xs tabular-nums text-ink-faint">
          {shown.length} / {owing.length} borçlu firma gösteriliyor
          {zeroCount > 0 ? ` · bakiyesi sıfır ${zeroCount} firma listelenmedi` : ""}
        </p>
      </Panel>

      <Note>
        Tahsilatlar en eski borçtan başlayarak (FIFO) mahsup edilir; vade,
        borcun oluştuğu tarihe firmanın vade günü eklenerek bulunur. Kırmızı
        yalnızca <strong>90+</strong> sütununda: elli satırlık bir tabloda her
        gecikmeyi kırmızıya boyamak uyarı değil desen olur (Adım 6 kuralı).
      </Note>
    </div>
  );
}

/**
 * Yaşlandırma hücresi. `worst` yalnızca 90+ sütununda: kırmızı bir sayı bir
 * satırda uyarıdır, dört sütun x elli satırda desendir — göz onu okumaz.
 */
function Aged({ value, worst = false }: { value: string; worst?: boolean }) {
  const n = Number(value);
  if (n <= 0) {
    return (
      <Td align="right" numeric className="text-ink-faint">
        —
      </Td>
    );
  }
  return (
    <Td
      align="right"
      numeric
      className={worst ? "font-medium text-critical" : ""}
    >
      {formatTRY(value)}
    </Td>
  );
}

// ── shared bits ──

/**
 * Başlıklı özet tablosu: ilk sütun etiket, geri kalanı sayı.
 *
 * Hücreler sunucudan biçimlenmiş metin olarak geliyor, bu yüzden içerik
 * `string[][]` — tablo hiçbir şeyi yorumlamıyor, yalnızca hizalıyor.
 */
function SummaryTable({
  title,
  head,
  rows,
}: {
  title: string;
  head: string[];
  rows: string[][];
}) {
  return (
    <Panel title={title}>
      <Table>
        <THead>
          <tr>
            {head.map((h, i) => (
              <Th key={h} align={i === 0 ? "left" : "right"}>
                {h}
              </Th>
            ))}
          </tr>
        </THead>
        <TBody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <Td
                  key={ci}
                  align={ci === 0 ? "left" : "right"}
                  numeric={ci > 0}
                >
                  {cell}
                </Td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <TableEmpty colSpan={head.length} label="Bu aralıkta kayıt yok." />
          )}
        </TBody>
      </Table>
    </Panel>
  );
}

function Loading() {
  return <LoadingState />;
}

function Failed({ error }: { error: unknown }) {
  return <ErrorLine error={error ?? new Error("Rapor yüklenemedi")} />;
}
