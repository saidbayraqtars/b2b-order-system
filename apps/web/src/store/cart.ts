"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartLine {
  variantId: string;
  sku: string;
  productName: string;
  color: string | null;
  size: string | null;
  unitsPerCase: number;
  moqUnits: number;
  stock: number;
  netUnitPrice: number;
  vatRate: number;
  quantity: number;
}

export type CartLineSeed = Omit<CartLine, "quantity">;

/** Clamp qty to [moq, stock] and snap up to a whole number of cases. */
function normalizeQty(line: CartLineSeed, qty: number): number {
  const step = Math.max(1, line.unitsPerCase);
  let q = Math.max(line.moqUnits, qty);
  q = Math.ceil(q / step) * step; // snap to case multiple
  if (q > line.stock) {
    q = Math.floor(line.stock / step) * step; // largest case multiple within stock
  }
  return Math.max(0, q);
}

interface CartState {
  lines: CartLine[];
  add: (seed: CartLineSeed, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  inc: (variantId: string) => void;
  dec: (variantId: string) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],

      add: (seed, qty) =>
        set((state) => {
          const existing = state.lines.find(
            (l) => l.variantId === seed.variantId,
          );
          const startQty = qty ?? Math.max(seed.moqUnits, seed.unitsPerCase);
          if (existing) {
            const next = normalizeQty(existing, existing.quantity + startQty);
            return {
              lines: state.lines.map((l) =>
                l.variantId === seed.variantId ? { ...l, quantity: next } : l,
              ),
            };
          }
          return {
            lines: [
              ...state.lines,
              { ...seed, quantity: normalizeQty(seed, startQty) },
            ],
          };
        }),

      setQty: (variantId, qty) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.variantId === variantId
              ? { ...l, quantity: normalizeQty(l, qty) }
              : l,
          ),
        })),

      inc: (variantId) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.variantId === variantId
              ? { ...l, quantity: normalizeQty(l, l.quantity + l.unitsPerCase) }
              : l,
          ),
        })),

      dec: (variantId) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.variantId === variantId
              ? { ...l, quantity: normalizeQty(l, l.quantity - l.unitsPerCase) }
              : l,
          ),
        })),

      remove: (variantId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.variantId !== variantId),
        })),

      clear: () => set({ lines: [] }),
    }),
    { name: "b2b-cart" },
  ),
);

// ── Derived selectors ──

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
}

export function cartTotals(lines: CartLine[]): CartTotals {
  let subtotal = 0;
  let taxTotal = 0;
  for (const l of lines) {
    const net = l.netUnitPrice * l.quantity;
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
