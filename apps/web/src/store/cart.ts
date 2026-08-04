"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CartLineView, CartView } from "@repo/services";
import { apiDelete, apiGet, apiPost } from "@/lib/fetcher";

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

/** Clamp a quantity to [moq, stock] and snap up to a whole number of cases. */
export function normalizeQty(
  line: Pick<CartLine, "unitsPerCase" | "moqUnits" | "stock">,
  qty: number,
): number {
  const step = Math.max(1, line.unitsPerCase);
  let q = Math.max(line.moqUnits, qty);
  q = Math.ceil(q / step) * step;
  if (q > line.stock) {
    q = Math.floor(line.stock / step) * step;
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
    const net = Number(l.netUnitPrice ?? 0) * l.quantity;
    subtotal += net;
    taxTotal += (net * l.vatRate) / 100;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: round(subtotal),
    taxTotal: round(taxTotal),
    grandTotal: round(subtotal + taxTotal),
  };
}

interface ItemWrite {
  variantId: string;
  quantity: number;
  increment?: boolean;
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
    (variantId: string, quantity: number) => {
      qc.setQueryData<CartView>(key, (prev) =>
        prev
          ? {
              ...prev,
              lines:
                quantity === 0
                  ? prev.lines.filter((l) => l.variantId !== variantId)
                  : prev.lines.map((l) =>
                      l.variantId === variantId ? { ...l, quantity } : l,
                    ),
            }
          : prev,
      );
    },
    [qc, key],
  );

  const setQty = useCallback(
    (variantId: string, quantity: number) => {
      const line = lines.find((l) => l.variantId === variantId);
      const next = line ? normalizeQty(line, quantity) : quantity;
      optimistic(variantId, next);
      write.mutate({ variantId, quantity: next });
    },
    [lines, optimistic, write],
  );

  return {
    lines,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    isSaving: write.isPending || clearMutation.isPending,

    /** From a product card: add a case (or the MOQ, whichever is larger). */
    add: (seed: {
      variantId: string;
      unitsPerCase: number;
      moqUnits: number;
      stock: number;
    }) => {
      const existing = lines.find((l) => l.variantId === seed.variantId);
      const step = Math.max(seed.moqUnits, seed.unitsPerCase, 1);
      const next = normalizeQty(seed, (existing?.quantity ?? 0) + step);
      optimistic(seed.variantId, next);
      write.mutate({ variantId: seed.variantId, quantity: next });
    },

    setQty,
    inc: (variantId: string) => {
      const line = lines.find((l) => l.variantId === variantId);
      if (line) setQty(variantId, line.quantity + line.unitsPerCase);
    },
    dec: (variantId: string) => {
      const line = lines.find((l) => l.variantId === variantId);
      if (line) setQty(variantId, line.quantity - line.unitsPerCase);
    },
    remove: (variantId: string) => {
      optimistic(variantId, 0);
      write.mutate({ variantId, quantity: 0 });
    },
    clear: () => clearMutation.mutate(),
  };
}
