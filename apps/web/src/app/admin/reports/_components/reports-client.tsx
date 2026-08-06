"use client";

import { useState } from "react";
import Link from "next/link";
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

// Reporting dashboard. One shared date range drives every tab, so switching
// tabs compares the same window instead of silently changing it.

type Tab = "sales" | "products" | "reps" | "collections" | "receivables";

const TABS: { key: Tab; label: string }[] = [
  { key: "sales", label: "Satış" },
  { key: "products", label: "Ürünler" },
  { key: "reps", label: "Plasiyerler" },
  { key: "collections", label: "Tahsilat" },
  { key: "receivables", label: "Alacak yaşlandırma" },
];

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
  const [tab, setTab] = useState<Tab>("sales");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(daysAgo(0));

  const range = `from=${from}&to=${to}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-neutral-500">
          Başlangıç
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-2 h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="text-xs text-neutral-500">
          Bitiş
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="ml-2 h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <div className="flex gap-2">
          {[
            [7, "Son 7 gün"],
            [29, "Son 30 gün"],
            [89, "Son 90 gün"],
          ].map(([n, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setFrom(daysAgo(n as number));
                setTo(daysAgo(0));
              }}
              className="h-9 rounded-md border border-neutral-300 px-3 text-xs dark:border-neutral-700"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.key
                ? "border-indigo-600 font-semibold text-indigo-600"
                : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

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
        <Stat label="Ciro" value={formatTRY(d.revenue)} strong />
        <Stat label="Sipariş" value={String(d.orderCount)} />
        <Stat label="Ortalama sepet" value={formatTRY(d.averageOrderValue)} />
        <Stat
          label="Bekleyen"
          value={`${d.pendingCount} · ${formatTRY(d.pendingTotal)}`}
        />
      </div>

      {d.daily.length > 0 && (
        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-semibold">Günlük ciro</h2>
          {/* Bars, not a chart library — one dependency saved for five lines of CSS. */}
          <div className="flex h-32 items-end gap-1">
            {d.daily.map((p) => (
              <div
                key={p.date}
                title={`${p.date}: ${formatTRY(p.revenue)} (${p.orderCount} sipariş)`}
                className="flex-1 rounded-t bg-indigo-500/80 hover:bg-indigo-600"
                style={{
                  height: `${Math.max(4, (Number(p.revenue) / peak) * 100)}%`,
                }}
              />
            ))}
          </div>
          <p className="mt-2 flex justify-between text-xs text-neutral-500">
            <span>{d.daily[0]?.date}</span>
            <span>{d.daily[d.daily.length - 1]?.date}</span>
          </p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Table
          title="Duruma göre"
          head={["Durum", "Adet", "Tutar"]}
          rows={d.byStatus.map((s) => [
            STATUS_LABEL[s.status],
            String(s.orderCount),
            formatTRY(s.total),
          ])}
        />
        <Table
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
        <p className="text-sm text-neutral-500">
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
    <Table
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
    queryFn: () => apiGet<{ reps: RepPerformance[] }>(`/api/reports/reps?${range}`),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;

  return (
    <Table
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
    queryFn: () => apiGet<CollectionsReport>(`/api/reports/collections?${range}`),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const d = q.data!;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Toplam tahsilat" value={formatTRY(d.total)} strong />
        <Stat label="Kayıt" value={String(d.count)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Table
          title="Ödeme yöntemine göre"
          head={["Yöntem", "Adet", "Tutar"]}
          rows={d.byMethod.map((m) => [
            METHOD_LABEL[m.paymentMethod] ?? m.paymentMethod,
            String(m.count),
            formatTRY(m.total),
          ])}
        />
        <Table
          title="Kaydeden"
          head={["Kullanıcı", "Adet", "Tutar"]}
          rows={d.byRep.map((r) => [r.name, String(r.count), formatTRY(r.total)])}
        />
      </div>

      <Table
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

function ReceivablesTab() {
  const q = useQuery({
    queryKey: ["report", "receivables"],
    queryFn: () => apiGet<ReceivablesReport>("/api/reports/receivables"),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <Failed error={q.error} />;
  const d = q.data!;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Toplam alacak" value={formatTRY(d.totals.balance)} strong />
        <Stat
          label="Vadesi geçen"
          value={formatTRY(d.totals.overdue)}
          danger={Number(d.totals.overdue) > 0}
        />
        <Stat label="1-30 gün" value={formatTRY(d.totals.d1_30)} />
        <Stat label="31-60 gün" value={formatTRY(d.totals.d31_60)} />
        <Stat label="61-90 gün" value={formatTRY(d.totals.d61_90)} />
        <Stat
          label="90+ gün"
          value={formatTRY(d.totals.d90_plus)}
          danger={Number(d.totals.d90_plus) > 0}
        />
      </div>

      <section className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">Firma</th>
              <th className="px-3 py-2">Plasiyer</th>
              <th className="px-3 py-2 text-right">Vadesi gelmemiş</th>
              <th className="px-3 py-2 text-right">1-30</th>
              <th className="px-3 py-2 text-right">31-60</th>
              <th className="px-3 py-2 text-right">61-90</th>
              <th className="px-3 py-2 text-right">90+</th>
              <th className="px-3 py-2 text-right">Bakiye</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {d.companies.map((c) => (
              <tr key={c.companyId}>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/companies/${c.companyId}/statement`}
                    className="underline"
                  >
                    {c.companyName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-neutral-500">
                  {c.salesRepName ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatTRY(c.buckets.current)}
                </td>
                <Aged value={c.buckets.d1_30} />
                <Aged value={c.buckets.d31_60} />
                <Aged value={c.buckets.d61_90} />
                <Aged value={c.buckets.d90_plus} />
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatTRY(c.balance)}
                </td>
              </tr>
            ))}
            {d.companies.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-neutral-500" colSpan={8}>
                  Kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-neutral-500">
        Tahsilatlar en eski borçtan başlayarak (FIFO) mahsup edilir; vade, borcun
        oluştuğu tarihe firmanın vade günü eklenerek bulunur.
      </p>
    </div>
  );
}

function Aged({ value }: { value: string }) {
  const n = Number(value);
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums ${n > 0 ? "text-red-600" : "text-neutral-400"}`}
    >
      {n > 0 ? formatTRY(value) : "—"}
    </td>
  );
}

// ── shared bits ──

function Stat({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`tabular-nums ${strong ? "text-lg font-bold" : "text-lg"} ${
          danger ? "text-red-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Table({
  title,
  head,
  rows,
}: {
  title: string;
  head: string[];
  rows: string[][];
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <header className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 ${i === 0 ? "" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 ${ci === 0 ? "" : "text-right tabular-nums"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                className="px-3 py-6 text-center text-neutral-500"
                colSpan={head.length}
              >
                Bu aralıkta kayıt yok.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function Loading() {
  return <p className="text-sm text-neutral-500">Yükleniyor…</p>;
}

function Failed({ error }: { error: unknown }) {
  return (
    <p className="text-sm text-red-600">
      {error instanceof Error ? error.message : "Rapor yüklenemedi"}
    </p>
  );
}
