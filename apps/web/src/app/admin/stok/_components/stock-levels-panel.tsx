"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StockLevelRow, StockMovementRow, WarehouseRow } from "@repo/services";
import { STOCK_MOVEMENT_SOURCE_LABELS } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, Select, TextInput } from "@/components/form";
import { Badge, EmptyState, LoadingState, Table, TBody, Td, Th, THead } from "@/components/ui";

// Hangi üründe kaç adet var — ve bir satıra basınca o ürünün kendi defteri.
//
// İkisi aynı ekranda çünkü sorunun tamamı bu: "12 adet görünüyor, ama neden 12".
// Ayrı bir ekran, cevabı bir tık uzağa koyup kimsenin bakmadığı bir yere
// gönderiyordu.

export function StockLevelsPanel() {
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [openVariantId, setOpenVariantId] = useState<string | null>(null);

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => apiGet<{ warehouses: WarehouseRow[] }>("/api/admin/warehouses"),
  });

  const levels = useQuery({
    queryKey: ["stock-levels", "table", search, warehouseId, lowOnly],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "200" });
      if (search.trim()) params.set("q", search.trim());
      if (warehouseId) params.set("warehouseId", warehouseId);
      if (lowOnly) params.set("lowOnly", "1");
      return apiGet<{ levels: StockLevelRow[] }>(`/api/admin/stock?${params}`);
    },
  });

  return (
    <Panel
      title="Stok durumu"
      action={
        <div className="flex flex-wrap items-end gap-2">
          <label>
            <Label>Ara</Label>
            <TextInput
              value={search}
              placeholder="SKU, barkod, ürün"
              onChange={(e) => setSearch(e.target.value)}
              className="w-44"
            />
          </label>
          {(warehouses.data?.warehouses.length ?? 0) > 0 && (
            <label>
              <Label>Depo</Label>
              <Select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="w-36"
              >
                <option value="">Tümü</option>
                {(warehouses.data?.warehouses ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <Button
            variant={lowOnly ? "primary" : "secondary"}
            size="sm"
            onClick={() => setLowOnly((v) => !v)}
          >
            Kritik seviye
          </Button>
        </div>
      }
    >
      {levels.isLoading && <LoadingState />}
      <ErrorLine error={levels.error} />

      {levels.data &&
        (levels.data.levels.length === 0 ? (
          <EmptyState
            label={lowOnly ? "Kritik seviyede ürün yok." : "Bu filtrede ürün yok."}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Ürün</Th>
                <Th>SKU</Th>
                <Th align="right">Eldeki</Th>
                {warehouseId && <Th align="right">Depoda</Th>}
                <Th align="right">Kritik</Th>
                <Th>Raf</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {levels.data.levels.map((row) => {
                const critical = row.minStock !== null && row.stock <= row.minStock;
                const open = openVariantId === row.variantId;
                return (
                  <Fragment key={row.variantId}>
                    <tr>
                      <Td>{row.productName}</Td>
                      <Td>{row.sku}</Td>
                      <Td align="right" numeric>
                        <span
                          className={
                            critical ? "font-semibold text-red-600 dark:text-red-400" : ""
                          }
                        >
                          {row.stock}
                        </span>{" "}
                        <span className="text-neutral-500">{row.unit ?? "adet"}</span>
                      </Td>
                      {warehouseId && (
                        <Td align="right" numeric>
                          {row.warehouseOnHand ?? 0}
                        </Td>
                      )}
                      <Td align="right" numeric>
                        {row.minStock ?? "—"}
                      </Td>
                      <Td>{row.shelfCode ?? "—"}</Td>
                      <Td align="right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenVariantId(open ? null : row.variantId)}
                        >
                          {open ? "Gizle" : "Defter"}
                        </Button>
                      </Td>
                    </tr>
                    {open && (
                      <tr>
                        <Td colSpan={warehouseId ? 7 : 6}>
                          <VariantLedger variantId={row.variantId} />
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        ))}
    </Panel>
  );
}

/** Tek ürünün son hareketleri: "neden bu sayı" sorusunun cevabı. */
function VariantLedger({ variantId }: { variantId: string }) {
  const ledger = useQuery({
    queryKey: ["stock-movements", "variant", variantId],
    queryFn: () =>
      apiGet<{ movements: StockMovementRow[] }>(
        `/api/admin/stock-movements?variantId=${variantId}&limit=20`,
      ),
  });

  if (ledger.isLoading) return <LoadingState />;
  if (ledger.error) return <ErrorLine error={ledger.error} />;
  if (!ledger.data || ledger.data.movements.length === 0) {
    return (
      <p className="py-2 text-sm text-neutral-500">
        Bu ürün için hareket yok — sayı defter kurulmadan önce yazılmış.
      </p>
    );
  }

  return (
    <ul className="space-y-1 py-1 text-sm">
      {ledger.data.movements.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-2">
          <span
            className={
              m.direction === "IN"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }
          >
            {m.direction === "IN" ? "+" : "−"}
            {m.quantity}
          </span>
          <span className="text-neutral-500">→ {m.balanceAfter}</span>
          <Badge tone="neutral">{STOCK_MOVEMENT_SOURCE_LABELS[m.source]}</Badge>
          <span className="text-neutral-500">
            {new Date(m.occurredAt).toLocaleDateString("tr-TR")}
            {m.orderNumber ? ` · ${m.orderNumber}` : ""}
            {m.description ? ` · ${m.description}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
