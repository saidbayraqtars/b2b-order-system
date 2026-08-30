"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  StockLevelRow,
  StockMovementRow,
  WarehouseRow,
} from "@repo/services";
import { STOCK_MOVEMENT_SOURCE_LABELS } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { ShowMore, useVisibleSlice } from "@/components/show-more";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import {
  Badge,
  LoadingState,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";

// Hangi üründe kaç adet var — ve bir satıra basınca o ürünün kendi defteri.
//
// İkisi aynı ekranda çünkü sorunun tamamı bu: "12 adet görünüyor, ama neden 12".
// Ayrı bir ekran, cevabı bir tık uzağa koyup kimsenin bakmadığı bir yere
// gönderiyordu.

/**
 * Kaç satır çizilir.
 *
 * Önce 200'dü ve ekran görüntüsü sebebi gösterdi: 2.654 ürünlük bir katalogda
 * 200 satır, altı bin pikselden uzun bir liste demek — kimsenin baktığı bir
 * "stok durumu" değil, kimsenin okumadığı bir döküm. Aranan ürünü bulmanın yolu
 * kaydırmak değil, üstteki arama kutusu.
 */
const PAGE_SIZE = 50;

/**
 * Sunucudan elli satır iniyor ama ekrana yirmisi çiziliyor: kesme **çizimde**,
 * istekte. Limiti yirmiye indirmek "en kritik yirmi ürün" demek olurdu ve
 * kullanıcının gerisini görmesinin tek yolu süzgeç kalırdı.
 */
const RENDER_STEP = 20;

export function StockLevelsPanel() {
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [openVariantId, setOpenVariantId] = useState<string | null>(null);

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () =>
      apiGet<{ warehouses: WarehouseRow[] }>("/api/admin/warehouses"),
  });

  const levels = useQuery({
    queryKey: ["stock-levels", "table", search, warehouseId, lowOnly],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (search.trim()) params.set("q", search.trim());
      if (warehouseId) params.set("warehouseId", warehouseId);
      if (lowOnly) params.set("lowOnly", "1");
      return apiGet<{ levels: StockLevelRow[] }>(`/api/admin/stock?${params}`);
    },
  });

  const page = useVisibleSlice(levels.data?.levels ?? [], RENDER_STEP);

  // Boş sütun çizilmiyor. Kritik seviye ve raf kodu isteğe bağlı alanlar;
  // hiçbir ürüne girilmemişse tablo iki sütun boyunca "—" basıyordu — bilgi
  // değil, göz yoran boşluk.
  const rows = levels.data?.levels ?? [];
  const hasCritical = rows.some((r) => r.minStock !== null);
  const hasShelf = rows.some((r) => r.shelfCode !== null);
  const columns =
    4 + (warehouseId ? 1 : 0) + (hasCritical ? 1 : 0) + (hasShelf ? 1 : 0);

  return (
    <Panel
      title="Stok durumu"
      bodyClassName="p-0"
      action={
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="lvl-q">Ara</Label>
            <TextInput
              id="lvl-q"
              size="sm"
              value={search}
              placeholder="SKU, barkod, ürün"
              onChange={(e) => setSearch(e.target.value)}
              className="w-44"
            />
          </div>
          {(warehouses.data?.warehouses.length ?? 0) > 0 && (
            <div>
              <Label htmlFor="lvl-wh">Depo</Label>
              <Select
                id="lvl-wh"
                size="sm"
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
            </div>
          )}
          <Button
            variant={lowOnly ? "primary" : "secondary"}
            size="sm"
            aria-pressed={lowOnly}
            onClick={() => setLowOnly((v) => !v)}
          >
            Kritik seviye
          </Button>
        </div>
      }
    >
      {levels.isLoading && (
        <div className="px-4">
          <LoadingState />
        </div>
      )}
      <div className="px-4">
        <ErrorLine error={levels.error} />
      </div>

      {levels.data && (
        <Table dense>
          <THead>
            <tr>
              <Th>Ürün</Th>
              <Th>SKU</Th>
              <Th align="right">Eldeki</Th>
              {warehouseId && <Th align="right">Depoda</Th>}
              {hasCritical && <Th align="right">Kritik</Th>}
              {hasShelf && <Th>Raf</Th>}
              <Th />
            </tr>
          </THead>
          <TBody>
            {levels.data.levels.length === 0 ? (
              <TableEmpty
                colSpan={columns}
                label={
                  lowOnly
                    ? "Kritik seviyede ürün yok."
                    : "Bu filtrede ürün yok."
                }
              />
            ) : (
              page.visible.map((row) => {
                const critical =
                  row.minStock !== null && row.stock <= row.minStock;
                const open = openVariantId === row.variantId;
                return (
                  <Fragment key={row.variantId}>
                    <tr>
                      <Td>{row.productName}</Td>
                      <Td className="tech-num">{row.sku}</Td>
                      <Td align="right" numeric>
                        <span className={critical ? "text-critical" : ""}>
                          {row.stock}
                        </span>{" "}
                        <span className="text-xs text-ink-faint">
                          {row.unit ?? "adet"}
                        </span>
                      </Td>
                      {warehouseId && (
                        <Td align="right" numeric>
                          {row.warehouseOnHand ?? 0}
                        </Td>
                      )}
                      {hasCritical && (
                        <Td align="right" numeric muted>
                          {row.minStock ?? "—"}
                        </Td>
                      )}
                      {hasShelf && <Td muted>{row.shelfCode ?? "—"}</Td>}
                      <Td align="right">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            setOpenVariantId(open ? null : row.variantId)
                          }
                        >
                          {open ? "Gizle" : "Defter"}
                        </Button>
                      </Td>
                    </tr>
                    {open && (
                      <tr>
                        <Td colSpan={columns} className="bg-sunken">
                          <VariantLedger variantId={row.variantId} />
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </TBody>
        </Table>
      )}

      {levels.data && (
        <div className="border-t border-line px-4 pb-3">
          <ShowMore
            visible={page.visible.length}
            total={page.total}
            hidden={page.hidden}
            onMore={page.showMore}
            noun="ürün"
            serverCapped={page.total >= PAGE_SIZE}
          />
        </div>
      )}
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
      <p className="py-2 text-body-sm text-ink-faint">
        Bu ürün için hareket yok — sayı defter kurulmadan önce yazılmış.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5 py-1 text-body-sm">
      {ledger.data.movements.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-2">
          <span
            className={
              m.direction === "IN"
                ? "w-14 text-right font-semibold tabular-nums text-positive"
                : "w-14 text-right font-semibold tabular-nums text-critical"
            }
          >
            {m.direction === "IN" ? "+" : "−"}
            {m.quantity}
          </span>
          <span className="tabular-nums text-ink-faint">
            → {m.balanceAfter}
          </span>
          <Badge tone="neutral">{STOCK_MOVEMENT_SOURCE_LABELS[m.source]}</Badge>
          <span className="text-ink-faint">
            {new Date(m.occurredAt).toLocaleDateString("tr-TR")}
            {m.orderNumber ? ` · ${m.orderNumber}` : ""}
            {m.description ? ` · ${m.description}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
