"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  StockCountResult,
  StockMovementRow,
  WarehouseRow,
} from "@repo/services";
import {
  STOCK_MOVEMENT_SOURCE_LABELS,
  StockMovementSourceEnum,
  type StockDirection,
  type StockMovementSource,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { ShowMore, useVisibleSlice } from "@/components/show-more";
import { Disclosure } from "@/components/disclosure";
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
  Chips,
  LoadingState,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { VariantPicker } from "./variant-picker";
import { formatQuantity } from "@/lib/format";

// Defterin kendisi, üstünde insanın yazdığı üç hareket: elle giriş/çıkış, sayım
// ve depolar arası aktarım.
//
// Üç form aynı anda değil, sırayla duruyor. Üçü birden açıkken panelin üstünde
// on dört kontrollük bir duvar oluşuyor ve altındaki defter ekrandan taşıyordu;
// oysa hiç kimse aynı anda hem sayım hem aktarım girmiyor. Şerit gömük zeminde,
// tablo başlığıyla aynı yüzeyde.
//
// Sipariş kaynaklı satırlarda iptal düğmesi yok. Onların öbür yarısı siparişin
// kendisi; yalnız stok bacağını geri almak, malı çıkmamış gösterip siparişi
// olduğu yerde bırakırdı.

type FormKey = "manual" | "count" | "transfer";

/**
 * Kaç hareket çizilir.
 *
 * Sunucunun varsayılanı 100'dü ve ekran görüntüsü onu altı bin pikselde
 * kırptırdı: defter, sonu görünmeyen bir şerit değil son işlemlerin listesi.
 * Daha eskisine giden yol kaydırmak değil, üstteki iki süzgeç.
 */
const PAGE_SIZE = 50;

/** İnen elli hareketin ilk dilimi — gerisi "daha fazla göster"in arkasında. */
const RENDER_STEP = 20;

export function MovementsPanel() {
  const qc = useQueryClient();
  const [source, setSource] = useState<StockMovementSource | "">("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormKey>("manual");

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () =>
      apiGet<{ warehouses: WarehouseRow[] }>("/api/admin/warehouses"),
  });

  const movements = useQuery({
    queryKey: ["stock-movements", source, search],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (source) params.set("source", source);
      if (search.trim()) params.set("q", search.trim());
      return apiGet<{ movements: StockMovementRow[] }>(
        `/api/admin/stock-movements?${params}`,
      );
    },
  });

  const page = useVisibleSlice(movements.data?.movements ?? [], RENDER_STEP);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["stock-movements"] });
    void qc.invalidateQueries({ queryKey: ["stock-levels"] });
    void qc.invalidateQueries({ queryKey: ["stock-summary"] });
  };

  const openWarehouses = (warehouses.data?.warehouses ?? []).filter(
    (w) => w.isActive,
  );
  const canTransfer = openWarehouses.length >= 2;

  // Aktarım şeridi yalnızca iki açık depo varken var. Depo kapatılınca seçili
  // kalmasın diye elle girişe düşülüyor.
  const active: FormKey = form === "transfer" && !canTransfer ? "manual" : form;

  return (
    <Panel
      title="Stok hareketleri"
      bodyClassName="p-0"
      action={
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="mv-q">Ürün</Label>
            <TextInput
              id="mv-q"
              size="sm"
              value={search}
              placeholder="SKU / ürün"
              onChange={(e) => setSearch(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="mv-source">Kaynak</Label>
            <Select
              id="mv-source"
              size="sm"
              value={source}
              onChange={(e) =>
                setSource(e.target.value as StockMovementSource | "")
              }
              className="w-44"
            >
              <option value="">Tümü</option>
              {StockMovementSourceEnum.options.map((s) => (
                <option key={s} value={s}>
                  {STOCK_MOVEMENT_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      }
    >
      {/* Şeridin tamamı da katlanıyor: `Chips` üç formu bire indirmişti ama
          o bir form da defterin üstünde sürekli duruyordu. Defteri okumak
          buraya bakmanın kaç katı yapılıyorsa, varsayılan o olmalı. */}
      <div className="border-b border-line bg-sunken p-3">
        <Disclosure label="+ Hareket kaydet" storageKey="stok:hareket-formu">
          <div className="pt-2">
            <Chips
              value={active}
              onChange={setForm}
              items={[
                { key: "manual" as const, label: "Elle giriş / çıkış" },
                { key: "count" as const, label: "Sayım" },
                ...(canTransfer
                  ? [
                      {
                        key: "transfer" as const,
                        label: "Depolar arası aktarım",
                      },
                    ]
                  : []),
              ]}
            />
            <div className="mt-3">
              {active === "manual" && (
                <ManualEntryForm warehouses={openWarehouses} onDone={refresh} />
              )}
              {active === "count" && (
                <CountForm warehouses={openWarehouses} onDone={refresh} />
              )}
              {active === "transfer" && (
                <TransferForm warehouses={openWarehouses} onDone={refresh} />
              )}
            </div>
          </div>
        </Disclosure>
      </div>

      {movements.isLoading && (
        <div className="px-4">
          <LoadingState />
        </div>
      )}
      <div className="px-4">
        <ErrorLine error={movements.error} />
      </div>

      {movements.data && (
        <Table dense>
          <THead>
            <tr>
              <Th align="right">Hareket</Th>
              <Th>Ürün</Th>
              <Th>Kaynak</Th>
              <Th align="right">Kalan</Th>
              <Th>Tarih</Th>
              <Th>Açıklama</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {movements.data.movements.length === 0 ? (
              <TableEmpty colSpan={7} label="Bu filtrede hareket yok." />
            ) : (
              page.visible.map((m) => (
                <MovementRow key={m.id} movement={m} onChanged={refresh} />
              ))
            )}
          </TBody>
        </Table>
      )}

      {page.total > 0 && (
        <div className="border-t border-line px-4 pb-3">
          <ShowMore
            visible={page.visible.length}
            total={page.total}
            hidden={page.hidden}
            onMore={page.showMore}
            noun="hareket"
            serverCapped={page.total >= PAGE_SIZE}
          />
        </div>
      )}
    </Panel>
  );
}

function MovementRow({
  movement,
  onChanged,
}: {
  movement: StockMovementRow;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  const reverse = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/stock-movements/${movement.id}/reverse`, { reason }),
    onSuccess: () => {
      setAsking(false);
      setReason("");
      onChanged();
    },
  });

  const byOrder =
    movement.source === "ORDER" || movement.source === "ORDER_CANCEL";
  const canReverse =
    !byOrder && !movement.reversedById && !movement.reversalOfId;

  // Sipariş kaynaklı satırlarda açıklama zaten sipariş numarasıyla başlıyor
  // ("ORD-2026… · Sipariş ORD-2026…"); ikisini yan yana yazmak hücreyi üç
  // satıra çıkarıp bütün tabloyu uzatıyordu.
  const description = movement.description ?? "";
  const orderRef =
    movement.orderNumber && !description.includes(movement.orderNumber)
      ? movement.orderNumber
      : null;
  const note = [
    movement.warehouseName,
    orderRef,
    description,
    movement.recordedByName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Fragment>
      <tr>
        <Td align="right" numeric>
          <span
            className={
              movement.direction === "IN"
                ? "font-semibold text-positive"
                : "font-semibold text-critical"
            }
          >
            {movement.direction === "IN" ? "+" : "−"}
            {formatQuantity(movement.quantity)}
          </span>
        </Td>
        <Td>
          <div className="text-ink">{movement.productName}</div>
          <div className="text-xs text-ink-faint">{movement.sku}</div>
        </Td>
        <Td>
          <div className="flex flex-wrap gap-1">
            <Badge>{STOCK_MOVEMENT_SOURCE_LABELS[movement.source]}</Badge>
            {movement.reversedById && <Badge tone="danger">İptal edildi</Badge>}
            {movement.reversalOfId && <Badge tone="warning">İptal kaydı</Badge>}
          </div>
        </Td>
        <Td align="right" numeric>
          {formatQuantity(movement.balanceAfter)}
        </Td>
        <Td className="whitespace-nowrap text-ink-muted">
          {new Date(movement.occurredAt).toLocaleString("tr-TR")}
        </Td>
        <Td muted className="max-w-[28ch]">
          <span className="line-clamp-2" title={note || undefined}>
            {note || "—"}
          </span>
        </Td>
        <Td align="right">
          {canReverse && !asking && (
            <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
              İptal
            </Button>
          )}
        </Td>
      </tr>

      {/* Gerekçe hücreye sığmıyor: oraya konsaydı bütün "Açıklama" sütununu
          genişletirdi. Adım 4'te kasa defterinde aynı çözüm. */}
      {asking && (
        <tr>
          <Td colSpan={7} className="bg-sunken">
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                size="sm"
                value={reason}
                placeholder="İptal gerekçesi"
                onChange={(e) => setReason(e.target.value)}
                className="w-64"
              />
              <Button
                size="sm"
                variant="danger"
                disabled={reason.trim().length === 0}
                loading={reverse.isPending}
                onClick={() => reverse.mutate()}
              >
                İptal et
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAsking(false)}
              >
                Vazgeç
              </Button>
            </div>
            <ErrorLine error={reverse.error} />
          </Td>
        </tr>
      )}
    </Fragment>
  );
}

function WarehouseField({
  warehouses,
  value,
  onChange,
}: {
  warehouses: WarehouseRow[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (warehouses.length === 0) return null;
  return (
    <div>
      <Label hint="isteğe bağlı">Depo</Label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-36"
      >
        <option value="">Belirtilmedi</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ManualEntryForm({
  warehouses,
  onDone,
}: {
  warehouses: WarehouseRow[];
  onDone: () => void;
}) {
  const [variantId, setVariantId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [direction, setDirection] = useState<StockDirection>("OUT");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/stock-movements", {
        variantId,
        ...(warehouseId ? { warehouseId } : {}),
        direction,
        quantity: Number(quantity),
        description: description.trim(),
      }),
    onSuccess: () => {
      setQuantity("");
      setDescription("");
      onDone();
    },
  });

  const ready =
    variantId !== "" && Number(quantity) > 0 && description.trim().length > 0;

  return (
    <div>
      <VariantPicker value={variantId} onChange={setVariantId} />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <WarehouseField
          warehouses={warehouses}
          value={warehouseId}
          onChange={setWarehouseId}
        />
        <div>
          <Label>Yön</Label>
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as StockDirection)}
            className="w-28"
          >
            <option value="IN">Giriş</option>
            <option value="OUT">Çıkış</option>
          </Select>
        </div>
        <div>
          <Label>Miktar</Label>
          <TextInput
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-24"
          />
        </div>
        <div className="min-w-40 flex-1">
          <Label hint="zorunlu">Açıklama</Label>
          <TextInput
            value={description}
            placeholder="Fire, numune, hurda…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button
          disabled={!ready}
          loading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          Kaydet
        </Button>
      </div>
      <ErrorLine error={submit.error} />
    </div>
  );
}

function CountForm({
  warehouses,
  onDone,
}: {
  warehouses: WarehouseRow[];
  onDone: () => void;
}) {
  const [variantId, setVariantId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [counted, setCounted] = useState("");
  const [result, setResult] = useState<StockCountResult | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      apiPost<StockCountResult>("/api/admin/stock-movements/count", {
        variantId,
        ...(warehouseId ? { warehouseId } : {}),
        counted: Number(counted),
      }),
    onSuccess: (data) => {
      setResult(data);
      setCounted("");
      onDone();
    },
  });

  const ready = variantId !== "" && counted !== "" && Number(counted) >= 0;

  return (
    <div>
      <VariantPicker value={variantId} onChange={setVariantId} />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <WarehouseField
          warehouses={warehouses}
          value={warehouseId}
          onChange={setWarehouseId}
        />
        <div>
          <Label hint="sayılan">Miktar</Label>
          <TextInput
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="w-24"
          />
        </div>
        <Button
          disabled={!ready}
          loading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          Farkı işle
        </Button>
      </div>
      {result && (
        <p className="mt-2 text-xs text-ink-faint">
          {result.difference === 0
            ? `Defter zaten ${result.counted} diyordu — hareket yazılmadı.`
            : `${result.previous} → ${result.counted} (fark ${
                result.difference > 0 ? "+" : ""
              }${result.difference}) işlendi.`}
        </p>
      )}
      <ErrorLine error={submit.error} />
    </div>
  );
}

function TransferForm({
  warehouses,
  onDone,
}: {
  warehouses: WarehouseRow[];
  onDone: () => void;
}) {
  const [variantId, setVariantId] = useState("");
  const [fromWarehouseId, setFrom] = useState("");
  const [toWarehouseId, setTo] = useState("");
  const [quantity, setQuantity] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/stock-movements/transfer", {
        variantId,
        fromWarehouseId,
        toWarehouseId,
        quantity: Number(quantity),
      }),
    onSuccess: () => {
      setQuantity("");
      onDone();
    },
  });

  const ready =
    variantId !== "" &&
    fromWarehouseId !== "" &&
    toWarehouseId !== "" &&
    fromWarehouseId !== toWarehouseId &&
    Number(quantity) > 0;

  return (
    <div>
      <VariantPicker value={variantId} onChange={setVariantId} />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <Label>Nereden</Label>
          <Select
            value={fromWarehouseId}
            onChange={(e) => setFrom(e.target.value)}
            className="w-36"
          >
            <option value="">Seçin</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Nereye</Label>
          <Select
            value={toWarehouseId}
            onChange={(e) => setTo(e.target.value)}
            className="w-36"
          >
            <option value="">Seçin</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Miktar</Label>
          <TextInput
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-24"
          />
        </div>
        <Button
          disabled={!ready}
          loading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          Aktar
        </Button>
      </div>
      <ErrorLine error={submit.error} />
    </div>
  );
}
