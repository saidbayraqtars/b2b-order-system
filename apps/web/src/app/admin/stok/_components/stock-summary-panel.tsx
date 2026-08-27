"use client";

import { useQuery } from "@tanstack/react-query";
import type { StockSummary } from "@repo/services";
import { STOCK_MOVEMENT_SOURCE_LABELS } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { ErrorLine, Panel } from "@/components/form";
import {
  EmptyState,
  LoadingState,
  StatTile,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";

// Dönem özeti. Tek soruyu cevaplıyor: bu aralıkta stoktan çıkan malın ne kadarı
// satış, ne kadarı fire, ne kadarı ERP'nin düzeltmesi.
//
// Ayın başıyla açılıyor: fire ve sayım farkı bir günde görünmez, ay sonunda
// görünür.
//
// İki parçaya bölündü çünkü iki ayrı yere düşüyorlar — üç sayı sayfanın en
// üstünde, sebep kırılımı hareket defterinin başında. Sorgu ikisinde de aynı
// anahtarla açıldığı için React Query tek istek yapıyor.

export interface DateRange {
  from: string;
  to: string;
}

export function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthStart(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-01`;
}

export function useStockSummary(range: DateRange) {
  return useQuery({
    queryKey: ["stock-summary", range.from, range.to],
    queryFn: () =>
      apiGet<StockSummary>(
        `/api/admin/stock-movements/summary?from=${range.from}&to=${range.to}`,
      ),
  });
}

type SummaryQuery = ReturnType<typeof useStockSummary>;

/**
 * Dönemin üç sayısı.
 *
 * Yükleme sırasında kutular yerinde kalıyor, değerleri tire oluyor: sayı
 * gelince sayfanın geri kalanı aşağı kaymasın.
 */
export function StockSummaryTiles({ query }: { query: SummaryQuery }) {
  const d = query.data;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile
        label="Giren"
        value={d ? d.totalIn : "—"}
        tone="positive"
        hint="mal kabul, iade, sayım fazlası"
      />
      <StatTile
        label="Çıkan"
        value={d ? d.totalOut : "—"}
        tone="critical"
        hint="sipariş, fire, sayım eksiği"
      />
      <StatTile
        label="Net"
        value={d ? d.net : "—"}
        hint="dönem boyunca defterin oynadığı miktar"
      />
    </div>
  );
}

/** Aynı dönemin sebebe göre kırılımı — "çıkan 400 adetin kaçı fire". */
export function StockSourceBreakdown({ query }: { query: SummaryQuery }) {
  return (
    <Panel title="Dönem kırılımı" bodyClassName="p-0">
      {query.isLoading && (
        <div className="px-4">
          <LoadingState />
        </div>
      )}
      <div className="px-4">
        <ErrorLine error={query.error} />
      </div>

      {query.data &&
        (query.data.bySource.length === 0 ? (
          <EmptyState label="Bu aralıkta stok hareketi yok." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Sebep</Th>
                <Th align="right">Giren</Th>
                <Th align="right">Çıkan</Th>
                <Th align="right">Net</Th>
              </tr>
            </THead>
            <TBody>
              {query.data.bySource.map((line) => (
                <tr key={line.source}>
                  <Td>{STOCK_MOVEMENT_SOURCE_LABELS[line.source]}</Td>
                  <Td align="right" numeric>
                    {line.in}
                  </Td>
                  <Td align="right" numeric>
                    {line.out}
                  </Td>
                  <Td align="right" numeric>
                    {line.net}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        ))}
    </Panel>
  );
}
