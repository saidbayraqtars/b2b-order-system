"use client";

import { useQuery } from "@tanstack/react-query";
import type { PriceChangeSource, PriceHistoryRow } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { formatMoney } from "@/lib/format";
import { ErrorLine, Panel } from "@/components/form";
import {
  LoadingState,
  TBody,
  THead,
  Table,
  Td,
  Th,
} from "@/components/ui";

// Fiyat geçmişi (Said, 2026-10-05: "yalnız yönetimde"). Kapalı başlıyor:
// fiyata bakmak bir ürün sayfasının işi, geçmişine bakmak ara sıra. Künye
// son değişikliği taşıyor, yani kapalı başlık da bir cevap veriyor.

const SOURCE_LABEL: Record<PriceChangeSource, string> = {
  MANUAL: "Elle",
  BULK: "Toplu",
  ERP: "ERP",
  SCHEDULE: "Zamanlı",
  UNIT: "Paket",
};

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** "Bayi · KOLİ · 10+" — liste fiyatı, taban birim, 1 adet yazılmıyor. */
function tierLabel(r: PriceHistoryRow): string {
  const parts = [
    r.groupName ?? "Liste",
    r.unitName,
    r.minQuantity > 1 ? `${r.minQuantity}+` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function PriceHistoryPanel({ productId }: { productId: string }) {
  const query = useQuery({
    queryKey: ["admin", "product", productId, "price-history"],
    queryFn: () =>
      apiGet<{ history: PriceHistoryRow[] }>(
        `/api/admin/products/${productId}/price-history`,
      ),
  });

  const rows = query.data?.history ?? [];
  const summary = query.isLoading
    ? undefined
    : rows.length === 0
      ? "değişiklik yok"
      : `${rows.length} değişiklik · son ${day(rows[0]!.createdAt)}`;

  return (
    <Panel
      title="Fiyat geçmişi"
      collapsible
      defaultOpen={false}
      storageKey="product:price-history"
      summary={summary}
      bodyClassName="p-0"
    >
      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />
      {query.data && rows.length === 0 && (
        <p className="px-4 py-3 text-body-sm text-ink-faint">
          Bu ürünün fiyatı kayıt tutulmaya başlandığından beri değişmedi.
        </p>
      )}
      {rows.length > 0 && (
        <Table dense>
          <THead>
            <tr>
              <Th>Tarih</Th>
              <Th>SKU</Th>
              <Th>Fiyat</Th>
              <Th align="right">Eski</Th>
              <Th align="right">Yeni</Th>
              <Th>Kaynak</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td muted numeric>
                  {day(r.createdAt)}
                </Td>
                <Td className="tech-num">{r.sku}</Td>
                <Td>{tierLabel(r)}</Td>
                <Td align="right" numeric muted>
                  {r.oldPrice ? formatMoney(r.oldPrice, r.currency) : "yeni"}
                </Td>
                <Td align="right" numeric>
                  {r.newPrice ? formatMoney(r.newPrice, r.currency) : "silindi"}
                </Td>
                <Td muted>
                  {SOURCE_LABEL[r.source]}
                  {r.changedByName ? ` · ${r.changedByName}` : ""}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}
