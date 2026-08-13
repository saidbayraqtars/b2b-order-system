"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StockSummary } from "@repo/services";
import { STOCK_MOVEMENT_SOURCE_LABELS } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
import { EmptyState, LoadingState, Table, TBody, Td, Th, THead } from "@/components/ui";

// Dönem özeti. Tek soruyu cevaplıyor: bu aralıkta stoktan çıkan malın ne kadarı
// satış, ne kadarı fire, ne kadarı ERP'nin düzeltmesi.
//
// Bugünle açılıyor ama asıl işe yaradığı aralık ay: fire ve sayım farkı bir
// günde görünmez, ay sonunda görünür.

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-01`;
}

export function StockSummaryPanel() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [range, setRange] = useState({ from: monthStart(), to: today() });

  const query = useQuery({
    queryKey: ["stock-summary", range.from, range.to],
    queryFn: () =>
      apiGet<StockSummary>(
        `/api/admin/stock-movements/summary?from=${range.from}&to=${range.to}`,
      ),
  });

  return (
    <Panel
      title="Dönem özeti"
      action={
        <div className="flex items-end gap-2">
          <label>
            <Label>Başlangıç</Label>
            <TextInput
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </label>
          <label>
            <Label>Bitiş</Label>
            <TextInput
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </label>
          <Button size="sm" onClick={() => setRange({ from, to })}>
            Getir
          </Button>
        </div>
      }
    >
      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />

      {query.data && (
        <>
          <div className="mb-3 flex flex-wrap gap-6 text-sm">
            <span>
              Giren:{" "}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {query.data.totalIn}
              </strong>
            </span>
            <span>
              Çıkan:{" "}
              <strong className="text-red-600 dark:text-red-400">
                {query.data.totalOut}
              </strong>
            </span>
            <span>
              Net: <strong>{query.data.net}</strong>
            </span>
          </div>

          {query.data.bySource.length === 0 ? (
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
          )}
        </>
      )}
    </Panel>
  );
}
