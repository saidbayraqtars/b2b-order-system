"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { BackorderReport } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { ErrorLine, Panel } from "@/components/form";
import {
  Badge,
  LoadingState,
  StatTile,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { ShowMore, useVisibleSlice } from "@/components/show-more";

// Bekleyen bakiye — sipariş edilip sevk edilmemiş mal.
//
// İki tablo iki ayrı soruyu cevaplıyor ve bilerek ayrı duruyorlar:
//
//   Ürün bazında  → "neyden ne kadar borçluyuz, elde var mı"  (depo/satın alma)
//   Sipariş bazında → "hangi müşteri ne bekliyor"             (müşteri ilişkileri)
//
// Tek tabloda birleştirmek, iki farklı işi yapan iki kişiyi aynı listede
// süzmeye zorlardı.

export function BackorderPanel() {
  const query = useQuery({
    queryKey: ["backorders"],
    queryFn: () => apiGet<{ report: BackorderReport }>("/api/admin/backorders"),
  });

  const report = query.data?.report;
  const lines = useVisibleSlice(report?.lines ?? [], 20);

  if (query.isLoading) {
    return (
      <Panel title="Bekleyen bakiye">
        <LoadingState />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ErrorLine error={query.error} />

      {report && (
        <section className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Bekleyen adet"
            value={report.totalPending}
            hint="sipariş edildi, sevk edilmedi"
            tone={report.totalPending > 0 ? "caution" : "neutral"}
          />
          {/* Karşılanabilirlik bir **iş emri**: mal depoda, müşteri bekliyor. */}
          <StatTile
            label="Elden karşılanabilir"
            value={report.coverablePending}
            hint="mal depoda, sevk edilebilir"
            tone={report.coverablePending > 0 ? "positive" : "neutral"}
          />
          <StatTile
            label="Bekleyen ürün"
            value={report.variants.length}
            hint="kaç ayrı varyant"
          />
        </section>
      )}

      <Panel title="Ürün bazında" bodyClassName="p-0">
        <Table stickyHead>
          <THead>
            <tr>
              <Th>SKU</Th>
              <Th>Ürün</Th>
              <Th align="right">Bekleyen</Th>
              <Th align="right">Elde</Th>
              <Th align="right">Sipariş</Th>
              <Th align="right">En eski</Th>
              <Th>Durum</Th>
            </tr>
          </THead>
          <TBody>
            {(report?.variants.length ?? 0) === 0 && (
              <TableEmpty
                colSpan={7}
                label="Bekleyen bakiye yok — açık siparişlerin tamamı sevk edilmiş."
              />
            )}
            {report?.variants.map((v) => (
              <tr key={v.variantId}>
                <Td className="font-mono text-xs">{v.sku}</Td>
                <Td muted>{v.productName}</Td>
                <Td align="right" numeric className="font-medium text-ink">
                  {v.pending}
                </Td>
                <Td align="right" numeric muted>
                  {v.onHand}
                </Td>
                <Td align="right" numeric muted>
                  {v.orderCount}
                </Td>
                <Td align="right" numeric muted>
                  {v.oldestDays} gün
                </Td>
                <Td>
                  <Badge tone={v.coverable ? "success" : "warning"}>
                    {v.coverable ? "Sevk edilebilir" : "Mal gerekiyor"}
                  </Badge>
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Panel>

      <Panel title="Sipariş bazında" bodyClassName="p-0">
        <Table stickyHead>
          <THead>
            <tr>
              <Th>Sipariş</Th>
              <Th>Firma</Th>
              <Th>Ürün</Th>
              <Th align="right">Sipariş</Th>
              <Th align="right">Sevk</Th>
              <Th align="right">Bekleyen</Th>
              <Th align="right">Yaş</Th>
            </tr>
          </THead>
          <TBody>
            {lines.visible.length === 0 && (
              <TableEmpty colSpan={7} label="Bekleyen satır yok." />
            )}
            {lines.visible.map((l) => (
              <tr key={`${l.orderId}-${l.variantId}`}>
                <Td>
                  <Link
                    href={`/orders/${l.orderId}`}
                    className="font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {l.orderNumber}
                  </Link>
                </Td>
                <Td muted>{l.companyName}</Td>
                <Td muted>
                  {l.productName}
                  <span className="ml-1 font-mono text-xs text-ink-faint">
                    {l.sku}
                  </span>
                </Td>
                <Td align="right" numeric muted>
                  {l.quantity}
                </Td>
                <Td align="right" numeric muted>
                  {l.quantityShipped}
                </Td>
                <Td align="right" numeric className="font-medium text-ink">
                  {l.pending}
                </Td>
                <Td
                  align="right"
                  numeric
                  className={l.ageDays > 14 ? "text-caution" : "text-ink-faint"}
                >
                  {l.ageDays} gün
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <div className="px-4 pb-3">
          <ShowMore
            visible={lines.visible.length}
            total={lines.total}
            hidden={lines.hidden}
            onMore={lines.showMore}
            noun="satır"
          />
        </div>
      </Panel>
    </div>
  );
}
