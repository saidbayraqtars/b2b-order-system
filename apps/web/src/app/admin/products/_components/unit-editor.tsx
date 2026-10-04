"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminVariantUnit } from "@repo/services";
import { apiDelete, apiPatch, apiPost } from "@/lib/fetcher";
import { formatQuantity, formatTRY } from "@/lib/format";
import { parseQuantity } from "@/lib/quantity";
import { Button, ErrorLine, TextInput } from "@/components/form";

/**
 * Paket birimleri: koli, palet, çuval. Stok ve sipariş satırı taban birimde
 * (ADET, KG) kalır; paket yalnızca çarpan, kendi barkodu ve isteğe bağlı kendi
 * fiyatıdır. Fiyat boşsa paket taban fiyat × çarpandan fiyatlanır.
 */
export function UnitEditor({
  productId,
  variantId,
  baseUnit,
  units,
}: {
  productId: string;
  variantId: string;
  /** Kalemin taban birimi; boşsa adet. */
  baseUnit: string | null;
  units: AdminVariantUnit[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [factor, setFactor] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "product", productId] });
  };

  const create = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/variants/${variantId}/units`, {
        name: name.trim(),
        factor: parseQuantity(factor),
        barcode: barcode.trim() || null,
        // Türkçe klavye virgül üretir; API sayı bekliyor.
        price: price.trim() ? Number(price.replace(",", ".")) : null,
      }),
    onSuccess: () => {
      setName("");
      setFactor("");
      setBarcode("");
      setPrice("");
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiPatch(`/api/admin/variant-units/${id}`, body),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/variant-units/${id}`),
    onSuccess: invalidate,
  });

  const parsedFactor = parseQuantity(factor);
  const parsedPrice = price.trim() ? Number(price.replace(",", ".")) : 0;
  const canSave =
    name.trim() !== "" &&
    Number.isFinite(parsedFactor) &&
    parsedFactor > 0 &&
    Number.isFinite(parsedPrice) &&
    parsedPrice >= 0;
  const base = baseUnit ?? "adet";

  return (
    <div className="rounded border border-line bg-sunken p-3">
      <p className="tech-label mb-2">Paket birimleri</p>

      {units.length === 0 ? (
        <p className="mb-2 text-body-sm text-ink-faint">
          Paket birimi yok — kalem yalnızca {base} olarak satılır.
        </p>
      ) : (
        <table className="mb-3 w-full text-left text-body-sm">
          <thead className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            <tr>
              <th className="py-1">Birim</th>
              <th className="py-1 text-right">Çarpan</th>
              <th className="py-1">Barkod</th>
              <th className="py-1 text-right">Liste fiyatı</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id} className={u.isActive ? "border-t border-line" : "border-t border-line text-ink-faint"}>
                <td className="py-1 font-medium">{u.name}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatQuantity(u.factor)} {base}
                </td>
                <td className="py-1 tabular-nums">{u.barcode ?? "—"}</td>
                <td className="py-1 text-right tabular-nums">
                  {u.price !== null ? (
                    formatTRY(u.price)
                  ) : (
                    <span className="text-ink-faint">taban × {formatQuantity(u.factor)}</span>
                  )}
                </td>
                <td className="py-1 text-right">
                  <span className="inline-flex gap-3">
                    <button
                      type="button"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: u.id, body: { isActive: !u.isActive } })}
                      className="text-xs font-medium text-ink-muted hover:underline disabled:opacity-50"
                    >
                      {u.isActive ? "Pasife al" : "Etkinleştir"}
                    </button>
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        const note =
                          u.orderItemCount > 0
                            ? ` ${u.orderItemCount} sipariş satırı adını ve çarpanını korur.`
                            : "";
                        if (confirm(`"${u.name}" birimi silinsin mi?${note}`)) remove.mutate(u.id);
                      }}
                      className="text-xs font-medium text-critical hover:underline disabled:opacity-50"
                    >
                      Sil
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-28"
          placeholder="KOLİ"
          aria-label="Birim adı"
        />
        <TextInput
          value={factor}
          onChange={(e) => setFactor(e.target.value)}
          inputMode="decimal"
          className="w-28"
          placeholder={`kaç ${base}`}
          aria-label="Çarpan"
        />
        <TextInput
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          className="w-40"
          placeholder="Barkod (isteğe bağlı)"
          aria-label="Paket barkodu"
        />
        <TextInput
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          className="w-28"
          placeholder="Fiyat (boş)"
          aria-label="Paket liste fiyatı"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!canSave || create.isPending}
          onClick={() => create.mutate()}
        >
          Birim ekle
        </Button>
      </div>

      <ErrorLine error={create.error} />
      <ErrorLine error={update.error} />
      <ErrorLine error={remove.error} />
    </div>
  );
}
