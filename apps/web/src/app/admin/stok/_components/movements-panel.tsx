"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StockCountResult, StockMovementRow, WarehouseRow } from "@repo/services";
import {
  STOCK_MOVEMENT_SOURCE_LABELS,
  StockMovementSourceEnum,
  type StockDirection,
  type StockMovementSource,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, Select, TextInput } from "@/components/form";
import { Badge, EmptyState, LoadingState } from "@/components/ui";
import { VariantPicker } from "./variant-picker";

// Defterin kendisi, üstünde insanın yazdığı üç hareket: elle giriş/çıkış, sayım
// ve depolar arası aktarım.
//
// Sipariş kaynaklı satırlarda iptal düğmesi yok. Onların öbür yarısı siparişin
// kendisi; yalnız stok bacağını geri almak, malı çıkmamış gösterip siparişi
// olduğu yerde bırakırdı.

export function MovementsPanel() {
  const qc = useQueryClient();
  const [source, setSource] = useState<StockMovementSource | "">("");
  const [search, setSearch] = useState("");

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => apiGet<{ warehouses: WarehouseRow[] }>("/api/admin/warehouses"),
  });

  const movements = useQuery({
    queryKey: ["stock-movements", source, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (source) params.set("source", source);
      if (search.trim()) params.set("q", search.trim());
      return apiGet<{ movements: StockMovementRow[] }>(
        `/api/admin/stock-movements?${params}`,
      );
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["stock-movements"] });
    void qc.invalidateQueries({ queryKey: ["stock-levels"] });
    void qc.invalidateQueries({ queryKey: ["stock-summary"] });
  };

  const openWarehouses = (warehouses.data?.warehouses ?? []).filter((w) => w.isActive);

  return (
    <Panel
      title="Stok hareketleri"
      action={
        <div className="flex items-end gap-2">
          <label>
            <Label>Ürün</Label>
            <TextInput
              value={search}
              placeholder="SKU / ürün"
              onChange={(e) => setSearch(e.target.value)}
              className="w-40"
            />
          </label>
          <label>
            <Label>Kaynak</Label>
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as StockMovementSource | "")}
              className="w-44"
            >
              <option value="">Tümü</option>
              {StockMovementSourceEnum.options.map((s) => (
                <option key={s} value={s}>
                  {STOCK_MOVEMENT_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          </label>
        </div>
      }
    >
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <ManualEntryForm warehouses={openWarehouses} onDone={refresh} />
        <CountForm warehouses={openWarehouses} onDone={refresh} />
        {openWarehouses.length >= 2 && (
          <TransferForm warehouses={openWarehouses} onDone={refresh} />
        )}
      </div>

      {movements.isLoading && <LoadingState />}
      <ErrorLine error={movements.error} />

      {movements.data &&
        (movements.data.movements.length === 0 ? (
          <EmptyState label="Bu filtrede hareket yok." />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {movements.data.movements.map((m) => (
              <MovementRow key={m.id} movement={m} onChanged={refresh} />
            ))}
          </ul>
        ))}
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

  const byOrder = movement.source === "ORDER" || movement.source === "ORDER_CANCEL";
  const canReverse = !byOrder && !movement.reversedById && !movement.reversalOfId;
  const sign = movement.direction === "IN" ? "+" : "−";
  const color =
    movement.direction === "IN"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className={color}>
              {sign}
              {movement.quantity}
            </span>
            <span>{movement.productName}</span>
            <span className="text-neutral-500">{movement.sku}</span>
            <Badge tone="neutral">
              {STOCK_MOVEMENT_SOURCE_LABELS[movement.source]}
            </Badge>
            {movement.reversedById && <Badge tone="danger">İptal edildi</Badge>}
            {movement.reversalOfId && <Badge tone="warning">İptal kaydı</Badge>}
          </p>
          <p className="text-neutral-500">
            Kalan: <strong>{movement.balanceAfter}</strong> ·{" "}
            {new Date(movement.occurredAt).toLocaleString("tr-TR")}
            {movement.warehouseName ? ` · ${movement.warehouseName}` : ""}
            {movement.orderNumber ? ` · ${movement.orderNumber}` : ""}
            {movement.description ? ` · ${movement.description}` : ""}
            {movement.recordedByName ? ` · ${movement.recordedByName}` : ""}
          </p>
        </div>

        {canReverse &&
          (asking ? (
            <div className="flex items-end gap-2">
              <TextInput
                value={reason}
                placeholder="İptal gerekçesi"
                onChange={(e) => setReason(e.target.value)}
                className="w-52"
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
              <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                Vazgeç
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
              İptal
            </Button>
          ))}
      </div>
      <ErrorLine error={reverse.error} />
    </li>
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
    <label>
      <Label hint="isteğe bağlı">Depo</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-36">
        <option value="">Belirtilmedi</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
    </label>
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
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Elle giriş / çıkış
      </h3>
      <VariantPicker value={variantId} onChange={setVariantId} />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <WarehouseField
          warehouses={warehouses}
          value={warehouseId}
          onChange={setWarehouseId}
        />
        <label>
          <Label>Yön</Label>
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as StockDirection)}
            className="w-28"
          >
            <option value="IN">Giriş</option>
            <option value="OUT">Çıkış</option>
          </Select>
        </label>
        <label>
          <Label>Adet</Label>
          <TextInput
            type="number"
            min={1}
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-24"
          />
        </label>
        <label className="min-w-40 flex-1">
          <Label hint="zorunlu">Açıklama</Label>
          <TextInput
            value={description}
            placeholder="Fire, numune, hurda…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
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
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Sayım
      </h3>
      <VariantPicker value={variantId} onChange={setVariantId} />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <WarehouseField
          warehouses={warehouses}
          value={warehouseId}
          onChange={setWarehouseId}
        />
        <label>
          <Label hint="sayılan">Adet</Label>
          <TextInput
            type="number"
            min={0}
            step="1"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="w-24"
          />
        </label>
        <Button
          disabled={!ready}
          loading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          Farkı işle
        </Button>
      </div>
      {result && (
        <p className="mt-2 text-xs text-neutral-500">
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
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Depolar arası aktarım
      </h3>
      <VariantPicker value={variantId} onChange={setVariantId} />
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label>
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
        </label>
        <label>
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
        </label>
        <label>
          <Label>Adet</Label>
          <TextInput
            type="number"
            min={1}
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-24"
          />
        </label>
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
