"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ShoppingBag, Wallet } from "lucide-react";
import type { ReceivablesReport, SalesSummary } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { ErrorLine, Panel } from "@/components/form";
import {
  LoadingState,
  StatTile,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";

// Web view of a rep's portfolio: what is owed and how the last 30 days went,
// and the row from which each of the day's three jobs — order, collection,
// visit — is started for a given customer.
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
    return <ErrorLine error={receivables.error} />;
  }

  const d = receivables.data!;

  // Vadesi geçen önde, sonra bakiye, sonra ad. Sunucu ada göre sıralı
  // döndürüyor ve o sıra "bugün kimi arayacağım" sorusuna hiçbir şey söylemiyor.
  // Liste kesilmiyor: portföy plasiyerin bütün müşterileri ve buradaki satır
  // aynı zamanda sipariş girmenin yolu — borcu olmayan bir müşteriyi listenin
  // dışına atmak, ona sipariş girmeyi zorlaştırırdı.
  const companies = [...d.companies].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      Number(b.balance) - Number(a.balance) ||
      a.companyName.localeCompare(b.companyName, "tr"),
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Portföy" value={d.companies.length} hint="firma" />
        <StatTile label="Toplam alacak" value={formatTRY(d.totals.balance)} />
        <StatTile
          label="Vadesi geçen"
          value={formatTRY(d.totals.overdue)}
          tone={Number(d.totals.overdue) > 0 ? "critical" : "neutral"}
          hint={Number(d.totals.overdue) > 0 ? "vadesi doldu" : undefined}
        />
        <StatTile
          label="Son 30 gün ciro"
          value={sales.data ? formatTRY(sales.data.revenue) : "…"}
        />
      </section>

      <Panel title="Portföy alacakları" bodyClassName="p-0 pb-1">
        <Table>
          <THead>
            <tr>
              <Th>Firma</Th>
              <Th align="right">Limit</Th>
              <Th align="right">Bakiye</Th>
              <Th align="right">Vadesi geçen</Th>
              <Th>En eski vade</Th>
              <Th align="right">İşlem</Th>
            </tr>
          </THead>
          <TBody>
            {companies.map((c) => (
              <tr key={c.companyId}>
                <Td>{c.companyName}</Td>
                <Td align="right" numeric muted>
                  {formatTRY(c.creditLimit)}
                </Td>
                <Td align="right" numeric>
                  {formatTRY(c.balance)}
                </Td>
                <Td
                  align="right"
                  numeric
                  className={
                    Number(c.overdue) > 0
                      ? "font-medium text-critical"
                      : "text-ink-faint"
                  }
                >
                  {Number(c.overdue) > 0 ? formatTRY(c.overdue) : "—"}
                </Td>
                <Td muted>
                  {c.oldestDueDate
                    ? new Date(c.oldestDueDate).toLocaleDateString("tr-TR")
                    : "—"}
                </Td>
                <Td align="right">
                  {/* Portföy satırından sahanın üç işi de tek tıkla açılır;
                      firma seçimi bağlantıda taşındığı için hedef ekran hangi
                      cariyle çalışıldığını sormaz. */}
                  <div className="flex justify-end gap-1.5">
                    <RowAction
                      href={`/portal?companyId=${encodeURIComponent(c.companyId)}`}
                      icon={ShoppingBag}
                      label="Sipariş"
                    />
                    <RowAction
                      href={`/rep/tahsilat?companyId=${encodeURIComponent(c.companyId)}`}
                      icon={Wallet}
                      label="Tahsilat"
                    />
                    <RowAction
                      href={`/rep/ziyaret?companyId=${encodeURIComponent(c.companyId)}`}
                      icon={MapPin}
                      label="Ziyaret"
                    />
                  </div>
                </Td>
              </tr>
            ))}
            {companies.length === 0 && (
              <TableEmpty colSpan={6} label="Portföyünüzde firma yok." />
            )}
          </TBody>
        </Table>
      </Panel>

      {sales.data && sales.data.topCompanies.length > 0 && (
        <Panel title="Son 30 günün en iyileri" bodyClassName="p-0 pb-1">
          <Table>
            <THead>
              <tr>
                <Th>Firma</Th>
                <Th align="right">Sipariş</Th>
                <Th align="right">Ciro</Th>
              </tr>
            </THead>
            <TBody>
              {sales.data.topCompanies.map((c) => (
                <tr key={c.companyId}>
                  <Td>{c.companyName}</Td>
                  <Td align="right" numeric>
                    {c.orderCount}
                  </Td>
                  <Td align="right" numeric>
                    {formatTRY(c.revenue)}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}

/**
 * Portföy satırındaki kompakt işlem bağlantısı.
 *
 * `LinkButton` değil: o `sm` boyunda 32 piksel yüksekliğinde ve üç tanesi yan
 * yana tablonun satır yüksekliğini iki katına çıkarıyor. Burada istenen şey
 * satırın içine sığan bir künye-düğme; görünümün geri kalanı (kenar, köşe,
 * üzerine gelince dolma) ortak `Chips` diliyle aynı.
 */
function RowAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-line bg-panel px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-accent hover:bg-accent hover:text-on-accent"
    >
      <Icon className="h-3 w-3" />
      {label}
    </Link>
  );
}
