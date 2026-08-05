"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReceivablesReport, SalesSummary } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Card, EmptyState, LoadingState } from "@/components/ui";

// Web view of a rep's portfolio: what is owed and how the last 30 days went.
// Ordering, check-in and collection stay in the mobile app — this is the desk
// view a rep opens before heading out.
export function RepDashboard() {
  const receivables = useQuery({
    queryKey: ["report", "receivables"],
    queryFn: () => apiGet<ReceivablesReport>("/api/reports/receivables"),
  });
  const sales = useQuery({
    queryKey: ["report", "sales", "rep-30d"],
    queryFn: () => apiGet<SalesSummary>("/api/reports/sales"),
  });

  if (receivables.isLoading) {
    return <LoadingState />;
  }
  if (receivables.isError) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {(receivables.error as Error).message}
      </p>
    );
  }

  const d = receivables.data!;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Portföy" value={`${d.companies.length} firma`} />
        <Stat label="Toplam alacak" value={formatTRY(d.totals.balance)} />
        <Stat
          label="Vadesi geçen"
          value={formatTRY(d.totals.overdue)}
          danger={Number(d.totals.overdue) > 0}
        />
        <Stat
          label="Son 30 gün ciro"
          value={sales.data ? formatTRY(sales.data.revenue) : "…"}
        />
      </section>

      <section className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-card dark:border-neutral-800 dark:bg-neutral-900">
        <header className="border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Portföy alacakları</h2>
        </header>
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">Firma</th>
              <th className="px-3 py-2 text-right">Limit</th>
              <th className="px-3 py-2 text-right">Bakiye</th>
              <th className="px-3 py-2 text-right">Vadesi geçen</th>
              <th className="px-3 py-2">En eski vade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {d.companies.map((c) => (
              <tr key={c.companyId}>
                <td className="px-3 py-2">{c.companyName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                  {formatTRY(c.creditLimit)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatTRY(c.balance)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    Number(c.overdue) > 0 ? "text-red-600" : "text-neutral-400"
                  }`}
                >
                  {Number(c.overdue) > 0 ? formatTRY(c.overdue) : "—"}
                </td>
                <td className="px-3 py-2 text-neutral-500">
                  {c.oldestDueDate
                    ? new Date(c.oldestDueDate).toLocaleDateString("tr-TR")
                    : "—"}
                </td>
              </tr>
            ))}
            {d.companies.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState label="Portföyünüzde firma yok." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {sales.data && sales.data.topCompanies.length > 0 && (
        <section className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-card dark:border-neutral-800 dark:bg-neutral-900">
          <header className="border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Son 30 günün en iyileri</h2>
          </header>
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">Firma</th>
                <th className="px-3 py-2 text-right">Sipariş</th>
                <th className="px-3 py-2 text-right">Ciro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {sales.data.topCompanies.map((c) => (
                <tr key={c.companyId}>
                  <td className="px-3 py-2">{c.companyName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.orderCount}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatTRY(c.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-sm text-neutral-500">
        Sipariş alma, ziyaret ve tahsilat işlemleri mobil uygulamada yapılır.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <Card>
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          danger ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-50"
        }`}
      >
        {value}
      </p>
    </Card>
  );
}
