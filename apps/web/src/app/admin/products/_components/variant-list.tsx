"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminVariantDetail } from "@repo/services";
import { apiDelete, apiPatch, apiPost } from "@/lib/fetcher";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { formatQuantity } from "@/lib/format";
import { parseQuantity, QUANTITY_SCALE_OPTIONS } from "@/lib/quantity";
import { Advanced } from "@/components/ui-mode";
import { PriceEditor } from "./price-editor";
import { UnitEditor } from "./unit-editor";

const EMPTY_VARIANT = {
  sku: "",
  barcode: "",
  color: "",
  size: "",
  unitsPerCase: "1",
  moqUnits: "1",
  stock: "0",
  unit: "",
  quantityScale: "0",
  costPrice: "",
  minStock: "",
  shelfCode: "",
};

export function VariantList({
  productId,
  variants,
  isService = false,
}: {
  productId: string;
  variants: AdminVariantDetail[];
  /** Hizmet stok tutmaz: stok alanları çizilmez (Product.type). */
  isService?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_VARIANT);
  // Yeni varyant formu bir düğmenin arkasında: on iki alanlık açık bir form,
  // ürünün kendisinden daha çok yer kaplıyordu. Varyantı olmayan üründe
  // açık başlar — orada yapılacak tek iş o.
  const [adding, setAdding] = useState(variants.length === 0);

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
        moqUnits: parseQuantity(draft.moqUnits),
        stock: parseQuantity(draft.stock),
        unit: draft.unit.trim() || null,
        quantityScale: Number(draft.quantityScale),
        costPrice: draft.costPrice ? Number(draft.costPrice) : null,
        minStock: draft.minStock ? parseQuantity(draft.minStock) : null,
        shelfCode: draft.shelfCode.trim() || null,
      }),
    onSuccess: () => {
      setDraft(EMPTY_VARIANT);
      setAdding(false);
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
        <p className="mb-3 text-body-sm text-ink-faint">
          Henüz varyant yok. Ürünün sipariş edilebilmesi için en az bir varyant
          ve bir fiyat kademesi gerekir.
        </p>
      )}

      <div className="space-y-2">
        {variants.map((v) => {
          const expanded = open === v.id;
          return (
            <div key={v.id} className="rounded border border-line">
              <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : v.id)}
                  className="text-body-sm font-medium text-ink hover:underline"
                >
                  {v.sku}
                </button>
                <span className="text-body-sm text-ink-muted">
                  {[v.color, v.size].filter(Boolean).join(" / ") || "—"}
                </span>
                {!isService && (
                  <span className="text-xs text-ink-faint">
                    koli {v.unitsPerCase} · min {formatQuantity(v.moqUnits)}
                  </span>
                )}
                <span
                  className={`text-xs ${
                    v.prices.length === 0 ? "text-caution" : "text-ink-faint"
                  }`}
                >
                  {v.prices.length === 0
                    ? "fiyat yok"
                    : `${v.prices.length} fiyat kademesi`}
                </span>
                {v.units.length > 0 && (
                  <span className="text-xs text-ink-faint">
                    {v.units.map((u) => `${u.name} ${formatQuantity(u.factor)}`).join(" · ")}
                  </span>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {isService ? (
                    <span className="text-xs text-ink-faint">
                      hizmet · stok tutulmaz
                    </span>
                  ) : (
                    <>
                      <Label>Stok</Label>
                      <StockInput
                        value={v.stock}
                        pending={update.isPending}
                        onCommit={(stock) =>
                          update.mutate({ id: v.id, body: { stock } })
                        }
                      />
                    </>
                  )}
                  <Button
                    variant="dangerQuiet"
                    size="sm"
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
                <div className="space-y-4 border-t border-line p-3">
                  <StockCard
                    variant={v}
                    pending={update.isPending}
                    onSave={(body) => update.mutate({ id: v.id, body })}
                  />
                  <PriceEditor variantId={v.id} productId={productId} />
                  <UnitEditor
                    productId={productId}
                    variantId={v.id}
                    baseUnit={v.unit}
                    units={v.units}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ErrorLine error={update.error} />
      <ErrorLine error={remove.error} />

      {!adding ? (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            Yeni varyant
          </Button>
        </div>
      ) : (
        <div className="mt-4 rounded border border-dashed border-line-strong p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="tech-label">Yeni varyant</p>
            {variants.length > 0 && (
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-xs text-ink-faint transition-colors hover:text-ink"
              >
                Vazgeç
              </button>
            )}
          </div>
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
            {/* Renk/beden ve depo alanları gelişmiş görünümde: basit kurulumda
                bir kalem SKU, barkod, birim ve (üründe) stokla açılıyor. */}
            <Advanced>
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
            </Advanced>
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
                inputMode="decimal"
                onChange={(e) => setDraft({ ...draft, moqUnits: e.target.value })}
              />
            </div>
            {!isService && (
              <div>
                <Label>Stok</Label>
                <TextInput
                  value={draft.stock}
                  inputMode="decimal"
                  onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                />
              </div>
            )}
            <div>
              <Label hint="ADET, KG, KOLİ…">Birim</Label>
              <TextInput
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
            </div>
            <div>
              <Label hint="Kilo, metre: ondalık">Miktar</Label>
              <Select
                value={draft.quantityScale}
                onChange={(e) =>
                  setDraft({ ...draft, quantityScale: e.target.value })
                }
              >
                {QUANTITY_SCALE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label hint="Müşteriye gösterilmez">Alış fiyatı</Label>
              <TextInput
                value={draft.costPrice}
                inputMode="decimal"
                onChange={(e) =>
                  setDraft({ ...draft, costPrice: e.target.value })
                }
              />
            </div>
            {!isService && (
              <Advanced>
                <div>
                  <Label hint="Altına düşünce uyarılır">Kritik stok</Label>
                  <TextInput
                    value={draft.minStock}
                    inputMode="decimal"
                    onChange={(e) =>
                      setDraft({ ...draft, minStock: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Raf kodu</Label>
                  <TextInput
                    value={draft.shelfCode}
                    onChange={(e) =>
                      setDraft({ ...draft, shelfCode: e.target.value })
                    }
                  />
                </div>
              </Advanced>
            )}
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
      )}
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
  const [text, setText] = useState(formatQuantity(value));

  const commit = () => {
    // Kesirli stok (0,75 kg) geçerli; kalemin ölçeğini sunucu denetliyor.
    const next = parseQuantity(text);
    if (!Number.isFinite(next) || next < 0 || next === value) {
      setText(formatQuantity(value)); // reject junk, snap back
      return;
    }
    onCommit(next);
  };

  return (
    <TextInput
      value={text}
      inputMode="decimal"
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
    quantityScale: String(variant.quantityScale),
    costPrice: variant.costPrice ?? "",
    minStock: variant.minStock != null ? formatQuantity(variant.minStock) : "",
    shelfCode: variant.shelfCode ?? "",
    isActive: variant.isActive,
    tracksLots: variant.tracksLots,
    shelfLifeDays:
      variant.shelfLifeDays != null ? String(variant.shelfLifeDays) : "",
    expiryWarningDays:
      variant.expiryWarningDays != null
        ? String(variant.expiryWarningDays)
        : "",
    pricingUnit: variant.pricingUnit ?? "",
    unitFactor: variant.unitFactor ?? "",
    isVariableWeight: variant.isVariableWeight,
  });

  return (
    <div className="rounded border border-line p-3">
      <p className="tech-label mb-2">Stok kartı</p>
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
            inputMode="decimal"
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
        <div>
          <Label hint="Kilo, metre: ondalık">Miktar</Label>
          <Select
            value={form.quantityScale}
            onChange={(e) => setForm({ ...form, quantityScale: e.target.value })}
          >
            {QUANTITY_SCALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/*
        Parti/SKT ve çift birim, stok kartının altında ayrı bir blokta duruyor:
        ikisi de gıda kurulumunun ayarı ve her kalemde doldurulmaz. Aynı ızgaraya
        karıştırılsalardı, ambalaj malzemesi giren kullanıcı da SKT sorusuyla
        karşılaşırdı.
      */}
      {/* Basit görünümde gizli — ama kalemde kullanılıyorsa her zaman görünür:
          dolu bir ayarı gizlemek, kullanıcının bilmediği bir şeyin stoğu ya da
          fiyatı değiştirmesi demek olurdu. */}
      <Advanced
        inUse={
          form.tracksLots ||
          form.isVariableWeight ||
          Boolean(form.pricingUnit || form.unitFactor || form.shelfLifeDays)
        }
        hint="Parti/SKT takibi ve çift birim gelişmiş görünümde."
      >
        <div className="mt-3 rounded border border-line p-3">
          <p className="tech-label mb-2">Parti / SKT &amp; çift birim</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <Label hint="Gün — SKT boşsa üretimden hesaplanır">
                Raf ömrü
              </Label>
              <TextInput
                value={form.shelfLifeDays}
                inputMode="numeric"
                onChange={(e) =>
                  setForm({ ...form, shelfLifeDays: e.target.value })
                }
              />
            </div>
            <div>
              <Label hint="Kaç gün kala uyarılsın (boş = 30)">
                Uyarı eşiği
              </Label>
              <TextInput
                value={form.expiryWarningDays}
                inputMode="numeric"
                onChange={(e) =>
                  setForm({ ...form, expiryWarningDays: e.target.value })
                }
              />
            </div>
            <div>
              <Label hint="Fiyat hangi birimde: KG, LT…">Fiyat birimi</Label>
              <TextInput
                value={form.pricingUnit}
                onChange={(e) =>
                  setForm({ ...form, pricingUnit: e.target.value })
                }
              />
            </div>
            <div>
              <Label hint="1 satış birimi kaç fiyat birimi (1 kasa = 12,5 kg)">
                Çarpan
              </Label>
              <TextInput
                value={form.unitFactor}
                inputMode="decimal"
                onChange={(e) =>
                  setForm({ ...form, unitFactor: e.target.value })
                }
              />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-4">
            <Checkbox
              checked={form.tracksLots}
              onChange={(e) =>
                setForm({ ...form, tracksLots: e.target.checked })
              }
              label="Parti & SKT takibi"
            />
            <Checkbox
              checked={form.isVariableWeight}
              onChange={(e) =>
                setForm({ ...form, isVariableWeight: e.target.checked })
              }
              label="Tartılarak sevk edilir"
            />
          </div>
        </div>
      </Advanced>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Checkbox
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          label="Aktif (pasif varyant katalogda görünmez)"
        />
        <Button
          disabled={pending}
          onClick={() =>
            onSave({
              unit: form.unit.trim() || null,
              quantityScale: Number(form.quantityScale),
              costPrice: form.costPrice ? Number(form.costPrice) : null,
              minStock: form.minStock ? parseQuantity(form.minStock) : null,
              shelfCode: form.shelfCode.trim() || null,
              isActive: form.isActive,
              tracksLots: form.tracksLots,
              shelfLifeDays: form.shelfLifeDays
                ? Number(form.shelfLifeDays)
                : null,
              expiryWarningDays: form.expiryWarningDays
                ? Number(form.expiryWarningDays)
                : null,
              pricingUnit: form.pricingUnit.trim() || null,
              unitFactor: form.unitFactor ? Number(form.unitFactor) : null,
              isVariableWeight: form.isVariableWeight,
            })
          }
        >
          Stok kartını kaydet
        </Button>
      </div>
    </div>
  );
}
