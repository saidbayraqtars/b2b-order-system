"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminVariantDetail } from "@repo/services";
import { apiDelete, apiPatch, apiPost } from "@/lib/fetcher";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  TextInput,
} from "@/components/form";
import { PriceEditor } from "./price-editor";

const EMPTY_VARIANT = {
  sku: "",
  barcode: "",
  color: "",
  size: "",
  unitsPerCase: "1",
  moqUnits: "1",
  stock: "0",
  unit: "",
  costPrice: "",
  minStock: "",
  shelfCode: "",
};

export function VariantList({
  productId,
  variants,
}: {
  productId: string;
  variants: AdminVariantDetail[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_VARIANT);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "product", productId] });
    void qc.invalidateQueries({ queryKey: ["admin", "products"] });
  };

  const create = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/products/${productId}/variants`, {
        sku: draft.sku.trim(),
        barcode: draft.barcode.trim() || null,
        color: draft.color.trim() || null,
        size: draft.size.trim() || null,
        unitsPerCase: Number(draft.unitsPerCase),
        moqUnits: Number(draft.moqUnits),
        stock: Number(draft.stock),
        unit: draft.unit.trim() || null,
        costPrice: draft.costPrice ? Number(draft.costPrice) : null,
        minStock: draft.minStock ? Number(draft.minStock) : null,
        shelfCode: draft.shelfCode.trim() || null,
      }),
    onSuccess: () => {
      setDraft(EMPTY_VARIANT);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiPatch(`/api/admin/variants/${id}`, body),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/variants/${id}`),
    onSuccess: invalidate,
  });

  return (
    <Panel title={`Varyantlar (${variants.length})`}>
      {variants.length === 0 && (
        <p className="mb-3 text-sm text-neutral-500">
          Henüz varyant yok. Ürünün sipariş edilebilmesi için en az bir varyant
          ve bir fiyat kademesi gerekir.
        </p>
      )}

      <div className="space-y-2">
        {variants.map((v) => {
          const expanded = open === v.id;
          return (
            <div
              key={v.id}
              className="rounded-md border border-neutral-200 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : v.id)}
                  className="text-sm font-medium hover:underline"
                >
                  {v.sku}
                </button>
                <span className="text-sm text-neutral-500">
                  {[v.color, v.size].filter(Boolean).join(" / ") || "—"}
                </span>
                <span className="text-xs text-neutral-400">
                  koli {v.unitsPerCase} · min {v.moqUnits}
                </span>
                <span
                  className={`text-xs ${
                    v.prices.length === 0 ? "text-amber-600" : "text-neutral-400"
                  }`}
                >
                  {v.prices.length === 0
                    ? "fiyat yok"
                    : `${v.prices.length} fiyat kademesi`}
                </span>

                <div className="ml-auto flex items-center gap-2">
                  <Label>Stok</Label>
                  <StockInput
                    value={v.stock}
                    pending={update.isPending}
                    onCommit={(stock) =>
                      update.mutate({ id: v.id, body: { stock } })
                    }
                  />
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    title={
                      v.orderItemCount > 0
                        ? "Siparişlerde kullanılıyor — silinemez"
                        : undefined
                    }
                    onClick={() => {
                      if (confirm(`"${v.sku}" varyantı silinsin mi?`))
                        remove.mutate(v.id);
                    }}
                  >
                    Sil
                  </Button>
                </div>
              </div>

              {expanded && (
                <div className="space-y-4 border-t border-neutral-200 p-3 dark:border-neutral-800">
                  <StockCard
                    variant={v}
                    pending={update.isPending}
                    onSave={(body) => update.mutate({ id: v.id, body })}
                  />
                  <PriceEditor variantId={v.id} productId={productId} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ErrorLine error={update.error} />
      <ErrorLine error={remove.error} />

      <div className="mt-4 rounded-md border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
        <p className="mb-2 text-xs font-medium uppercase text-neutral-500">
          Yeni varyant
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          <div>
            <Label>SKU</Label>
            <TextInput
              value={draft.sku}
              onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
            />
          </div>
          <div>
            <Label>Barkod</Label>
            <TextInput
              value={draft.barcode}
              onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
            />
          </div>
          <div>
            <Label>Renk</Label>
            <TextInput
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            />
          </div>
          <div>
            <Label>Beden / Ebat</Label>
            <TextInput
              value={draft.size}
              onChange={(e) => setDraft({ ...draft, size: e.target.value })}
            />
          </div>
          <div>
            <Label>Koli içi adet</Label>
            <TextInput
              value={draft.unitsPerCase}
              inputMode="numeric"
              onChange={(e) =>
                setDraft({ ...draft, unitsPerCase: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Min. sipariş</Label>
            <TextInput
              value={draft.moqUnits}
              inputMode="numeric"
              onChange={(e) => setDraft({ ...draft, moqUnits: e.target.value })}
            />
          </div>
          <div>
            <Label>Stok</Label>
            <TextInput
              value={draft.stock}
              inputMode="numeric"
              onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
            />
          </div>
          <div>
            <Label hint="ADET, KG, KOLİ…">Birim</Label>
            <TextInput
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            />
          </div>
          <div>
            <Label hint="Müşteriye gösterilmez">Alış fiyatı</Label>
            <TextInput
              value={draft.costPrice}
              inputMode="decimal"
              onChange={(e) => setDraft({ ...draft, costPrice: e.target.value })}
            />
          </div>
          <div>
            <Label hint="Altına düşünce uyarılır">Kritik stok</Label>
            <TextInput
              value={draft.minStock}
              inputMode="numeric"
              onChange={(e) => setDraft({ ...draft, minStock: e.target.value })}
            />
          </div>
          <div>
            <Label>Raf kodu</Label>
            <TextInput
              value={draft.shelfCode}
              onChange={(e) => setDraft({ ...draft, shelfCode: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button
              disabled={!draft.sku.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Varyant ekle
            </Button>
          </div>
        </div>
        <ErrorLine error={create.error} />
      </div>
    </Panel>
  );
}

/** Stock field that only writes on blur/Enter, so typing doesn't fire a PATCH per keystroke. */
function StockInput({
  value,
  pending,
  onCommit,
}: {
  value: number;
  pending: boolean;
  onCommit: (stock: number) => void;
}) {
  const [text, setText] = useState(String(value));

  const commit = () => {
    const next = Number(text);
    if (!Number.isInteger(next) || next < 0 || next === value) {
      setText(String(value)); // reject junk, snap back
      return;
    }
    onCommit(next);
  };

  return (
    <TextInput
      value={text}
      inputMode="numeric"
      disabled={pending}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="w-20 text-right"
    />
  );
}

/**
 * Stok kartının ERP alanları.
 *
 * Ayrı bir bölüm: bunlar siparişi değil *depoyu* ilgilendiriyor ve çoğu
 * kurulumda ERP köprüsü tarafından doldurulacak. Elle girildiğinde bir
 * sonraki eşleşmede köprü üzerine yazabilir — bu yüzden burada "kaydet"
 * düğmesi var, alan alan otomatik yazma yok.
 */
function StockCard({
  variant,
  pending,
  onSave,
}: {
  variant: AdminVariantDetail;
  pending: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    unit: variant.unit ?? "",
    costPrice: variant.costPrice ?? "",
    minStock: variant.minStock != null ? String(variant.minStock) : "",
    shelfCode: variant.shelfCode ?? "",
    isActive: variant.isActive,
  });

  return (
    <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="mb-2 text-xs font-medium uppercase text-neutral-500">
        Stok kartı
      </p>
      <div className="grid gap-2 sm:grid-cols-4">
        <div>
          <Label hint="ADET, KG, KOLİ…">Birim</Label>
          <TextInput
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
        </div>
        <div>
          <Label hint="Müşteriye gösterilmez">Alış fiyatı</Label>
          <TextInput
            value={form.costPrice}
            inputMode="decimal"
            onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
          />
        </div>
        <div>
          <Label hint="Altına düşünce uyarılır">Kritik stok</Label>
          <TextInput
            value={form.minStock}
            inputMode="numeric"
            onChange={(e) => setForm({ ...form, minStock: e.target.value })}
          />
        </div>
        <div>
          <Label>Raf kodu</Label>
          <TextInput
            value={form.shelfCode}
            onChange={(e) => setForm({ ...form, shelfCode: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Aktif (pasif varyant katalogda görünmez)
        </label>
        <Button
          disabled={pending}
          onClick={() =>
            onSave({
              unit: form.unit.trim() || null,
              costPrice: form.costPrice ? Number(form.costPrice) : null,
              minStock: form.minStock ? Number(form.minStock) : null,
              shelfCode: form.shelfCode.trim() || null,
              isActive: form.isActive,
            })
          }
        >
          Stok kartını kaydet
        </Button>
      </div>
    </div>
  );
}
