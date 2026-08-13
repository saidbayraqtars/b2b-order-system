"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminPriceRow, CustomerGroupRow } from "@repo/services";
import { apiDelete, apiGet, apiPost } from "@/lib/fetcher";
import { LoadingState } from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOLS, type Currency } from "@repo/types";
import { formatTRY } from "@/lib/format";
import { Button, ErrorLine, Select, TextInput } from "@/components/form";

/**
 * Price tiers for one variant: (customer group × minimum quantity) → price.
 * A null group is the default list price used when the buyer's group has no
 * row of its own — mirrors the precedence in resolvePrice().
 */
export function PriceEditor({
  variantId,
  productId,
}: {
  variantId: string;
  productId: string;
}) {
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState("");
  const [minQuantity, setMinQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>("TRY");

  const groups = useQuery({
    queryKey: ["admin", "customer-groups"],
    queryFn: () =>
      apiGet<{ groups: CustomerGroupRow[] }>("/api/admin/customer-groups"),
  });

  const prices = useQuery({
    queryKey: ["admin", "prices", variantId],
    queryFn: () =>
      apiGet<{ prices: AdminPriceRow[] }>(
        `/api/admin/variants/${variantId}/prices`,
      ),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "prices", variantId] });
    void qc.invalidateQueries({ queryKey: ["admin", "product", productId] });
    void qc.invalidateQueries({ queryKey: ["admin", "products"] });
  };

  const save = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/variants/${variantId}/prices`, {
        customerGroupId: groupId || null,
        minQuantity: Number(minQuantity),
        // Turkish keyboards produce a comma; the API wants a JSON number.
        price: Number(price.replace(",", ".")),
        currency,
      }),
    onSuccess: () => {
      setPrice("");
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/prices/${id}`),
    onSuccess: invalidate,
  });

  const parsedPrice = Number(price.replace(",", "."));
  const canSave =
    price.trim() !== "" &&
    Number.isFinite(parsedPrice) &&
    parsedPrice >= 0 &&
    Number(minQuantity) >= 1;

  const rows = prices.data?.prices ?? [];

  return (
    <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900/60">
      <p className="mb-2 text-xs font-medium uppercase text-neutral-500">
        Fiyat kademeleri
      </p>

      {prices.isLoading && <LoadingState />}
      {rows.length === 0 && prices.isSuccess && (
        <p className="mb-2 text-sm text-amber-600">
          Fiyat tanımlı değil — bu varyant sipariş edilemez.
        </p>
      )}

      {rows.length > 0 && (
        <table className="mb-3 w-full text-left text-sm">
          <thead className="text-xs uppercase text-neutral-400">
            <tr>
              <th className="py-1">Grup</th>
              <th className="py-1 text-right">Min. adet</th>
              <th className="py-1 text-right">Fiyat</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                className="border-t border-neutral-200 dark:border-neutral-800"
              >
                <td className="py-1">
                  {p.customerGroupName ?? (
                    <span className="text-neutral-500">Varsayılan (liste)</span>
                  )}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {p.minQuantity}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {p.currency === "TRY"
                    ? formatTRY(p.price)
                    : `${p.price} ${CURRENCY_SYMBOLS[p.currency as Currency] ?? p.currency}`}
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(p.id)}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="w-44"
        >
          <option value="">Varsayılan (liste)</option>
          {(groups.data?.groups ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <TextInput
          value={minQuantity}
          onChange={(e) => setMinQuantity(e.target.value)}
          inputMode="numeric"
          className="w-24"
          placeholder="Min. adet"
        />
        <TextInput
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          className="w-28"
          placeholder="Fiyat"
        />
        {/*
          Para birimi kademe başına: aynı ürünün liste fiyatı dolarla, bayi
          fiyatı TL ile verilebiliyor. Sipariş anında hepsi TL'ye çevriliyor.
        */}
        <Select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="w-24"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          disabled={!canSave || save.isPending}
          onClick={() => save.mutate()}
        >
          Kademeyi kaydet
        </Button>
      </div>

      <ErrorLine error={save.error} />
      <ErrorLine error={remove.error} />
    </div>
  );
}
