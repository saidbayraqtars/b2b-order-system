"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CartLineView, CartView } from "@repo/services";
import { apiDelete, apiGet, apiPost } from "@/lib/fetcher";
import { roundToScale, type QuantityRule } from "@/lib/quantity";

// The cart lives on the server; this is the client's view of it.
//
// It used to be a zustand store in local storage, which meant the basket a
// purchaser built on their phone did not exist on their desktop, and a rep who
// closed the tab lost the customer's order. Now every change is a request, and
// the response *is* the new state — the server always has the last word about
// what is in the cart and what it costs.
//
// Writes are optimistic so the buttons still feel instant; if a write fails the
// query is invalidated and the truth comes back.

export type CartLine = CartLineView;

export function cartKey(companyId: string) {
  return ["cart", companyId] as const;
}

/**
 * Clamp a quantity to [moq, stock] and snap it to what the line can be sold in:
 * whole cases for a case item, the variant's decimals otherwise (0,75 kg stays
 * 0,75 — it used to be rounded up to a whole unit).
 */
export function normalizeQty(
  line: QuantityRule,
  qty: number,
  /** Satır paketle alınıyorsa paketin çarpanı: miktar tam paket olur. */
  packageFactor?: number | null,
): number {
  const scale = line.quantityScale ?? 0;
  let q = Math.max(line.moqUnits, qty);
  if (packageFactor && packageFactor > 0) {
    const f = packageFactor;
    q = roundToScale(Math.ceil(roundToScale(q / f, 6) - 1e-9) * f, 3);
    if (q > line.stock) q = roundToScale(Math.floor(roundToScale(line.stock / f, 6) + 1e-9) * f, 3);
  } else if (line.unitsPerCase > 1) {
    const step = line.unitsPerCase;
    q = Math.ceil(q / step) * step;
    if (q > line.stock) q = Math.floor(line.stock / step) * step;
  } else {
    q = roundToScale(q, scale, "up");
    if (q > line.stock) q = roundToScale(line.stock, scale, "down");
  }
  return Math.max(0, q);
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
}

/**
 * Local totals, used only as the placeholder while the priced quote is in
 * flight. The number the buyer is committed to always comes from the server.
 */
export function cartTotals(lines: CartLine[]): CartTotals {
  let subtotal = 0;
  let taxTotal = 0;
  for (const l of lines) {
    // Paketli satır paket fiyatıyla: taban birime inmiş fiyat kuruşu kaybeder.
    const factor = lineFactor(l);
    const net =
      factor && l.packageNetPrice
        ? Number(l.packageNetPrice) * (l.quantity / factor)
        : Number(l.netUnitPrice ?? 0) * l.quantity;
    subtotal += net;
    taxTotal += (net * l.vatRate) / 100;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    // Üç ondalığa yuvarlanıyor: 0,1 + 0,2 rozet üzerinde 0,30000000000000004 olmasın.
    itemCount: roundToScale(
      lines.reduce((s, l) => s + l.quantity, 0),
      3,
    ),
    subtotal: round(subtotal),
    taxTotal: round(taxTotal),
    grandTotal: round(subtotal + taxTotal),
  };
}

interface ItemWrite {
  variantId: string;
  /** Taban birimde. */
  quantity: number;
  increment?: boolean;
  /** Paket birimi; null = taban birim. */
  unitId?: string | null;
}

/** Satırın paket çarpanı; taban birimdeyse null. */
export function lineFactor(line: Pick<CartLine, "unitId" | "units">): number | null {
  if (!line.unitId) return null;
  return line.units.find((u) => u.id === line.unitId)?.factor ?? null;
}

/** Artı/eksi düğmesinin adımı: paket, koli ya da bir birim. */
export function lineStep(line: CartLine): number {
  return lineFactor(line) ?? Math.max(line.unitsPerCase, 1);
}

export function useCart(companyId: string) {
  const qc = useQueryClient();
  const key = cartKey(companyId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => apiGet<CartView>(`/api/cart?companyId=${companyId}`),
    // A cart is personal and small; refetching it on focus is how a second tab
    // (or the phone in your hand) catches up.
    staleTime: 5_000,
  });

  // Memoised because the callbacks below close over it: a fresh [] on every
  // render would rebuild them every render.
  const lines = useMemo(() => query.data?.lines ?? [], [query.data]);

  const write = useMutation({
    mutationFn: (body: ItemWrite) =>
      apiPost<CartView>("/api/cart/items", { companyId, ...body }),
    onSuccess: (data) => qc.setQueryData(key, data),
    onError: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const clearMutation = useMutation({
    mutationFn: () => apiDelete(`/api/cart?companyId=${companyId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  /** Paint the change immediately, then let the response replace it. */
  const optimistic = useCallback(
    (variantId: string, quantity: number, unitId?: string | null) => {
      qc.setQueryData<CartView>(key, (prev) =>
        prev
          ? {
              ...prev,
              lines:
                quantity === 0
                  ? prev.lines.filter((l) => l.variantId !== variantId)
                  : prev.lines.map((l) =>
                      l.variantId === variantId
                        ? { ...l, quantity, ...(unitId !== undefined ? { unitId } : {}) }
                        : l,
                    ),
            }
          : prev,
      );
    },
    [qc, key],
  );

  const setQty = useCallback(
    (
      variantId: string,
      quantity: number,
      /** Verilirse satırın birimi de bu olur; verilmezse satırınki kalır. */
      unit?: { id: string; factor: number } | null,
    ) => {
      const line = lines.find((l) => l.variantId === variantId);
      const unitId = unit === undefined ? (line?.unitId ?? null) : (unit?.id ?? null);
      const factor = unit === undefined ? (line ? lineFactor(line) : null) : (unit?.factor ?? null);
      const next = line ? normalizeQty(line, quantity, factor) : quantity;
      optimistic(variantId, next, unitId);
      write.mutate({ variantId, quantity: next, unitId });
    },
    [lines, optimistic, write],
  );

  /**
   * Satırın birimini değiştir (adet ↔ koli). Miktar yeni birimin tam katına
   * yukarı yuvarlanır: 5 adet koliye geçince 1 koli (12) olur.
   */
  const setUnit = useCallback(
    (variantId: string, unitId: string | null) => {
      const line = lines.find((l) => l.variantId === variantId);
      if (!line) return;
      const factor = unitId ? (line.units.find((u) => u.id === unitId)?.factor ?? null) : null;
      const next = normalizeQty(line, line.quantity, factor);
      if (next === 0) return; // stok bir paketi bile karşılamıyor
      optimistic(variantId, next, unitId);
      write.mutate({ variantId, quantity: next, unitId });
    },
    [lines, optimistic, write],
  );

  return {
    lines,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    // Üç ondalığa yuvarlanıyor: 0,1 + 0,2 rozet üzerinde 0,30000000000000004 olmasın.
    itemCount: roundToScale(
      lines.reduce((s, l) => s + l.quantity, 0),
      3,
    ),
    isSaving: write.isPending || clearMutation.isPending,

    /**
     * From a product card: add a case (or the MOQ, whichever is larger). With
     * a package unit (koli, palet) one package is added; the line takes that
     * unit unless it already holds a different one, in which case the server
     * keeps the total in the base unit.
     */
    add: (
      seed: QuantityRule & { variantId: string },
      unit?: { id: string; factor: number } | null,
    ) => {
      const existing = lines.find((l) => l.variantId === seed.variantId);
      const unitId = unit?.id ?? null;
      const keepsUnit = !existing || (existing.unitId ?? null) === unitId;
      const step = unit ? unit.factor : Math.max(seed.moqUnits, seed.unitsPerCase, 1);
      const next = normalizeQty(
        seed,
        (existing?.quantity ?? 0) + step,
        keepsUnit ? (unit?.factor ?? null) : null,
      );
      const lineUnit = keepsUnit ? unitId : null;
      optimistic(seed.variantId, next, lineUnit);
      write.mutate({ variantId: seed.variantId, quantity: next, unitId: lineUnit });
    },

    setQty,
    setUnit,
    inc: (variantId: string) => {
      const line = lines.find((l) => l.variantId === variantId);
      if (line) setQty(variantId, line.quantity + lineStep(line));
    },
    dec: (variantId: string) => {
      const line = lines.find((l) => l.variantId === variantId);
      if (line) setQty(variantId, line.quantity - lineStep(line));
    },
    remove: (variantId: string) => {
      optimistic(variantId, 0);
      write.mutate({ variantId, quantity: 0 });
    },
    clear: () => clearMutation.mutate(),
  };
}
