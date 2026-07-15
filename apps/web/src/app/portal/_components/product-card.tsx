"use client";

import type { CatalogProduct, CatalogVariant } from "@repo/services";
import { useCart } from "@/store/cart";
import { formatTRY } from "@/lib/format";

function variantLabel(v: CatalogVariant): string {
  const parts = [v.color, v.size].filter(Boolean);
  return parts.length ? parts.join(" · ") : v.sku;
}

export function ProductCard({ product }: { product: CatalogProduct }) {
  const add = useCart((s) => s.add);

  return (
    <div className="flex flex-col rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3">
        <h3 className="font-semibold leading-tight">{product.name}</h3>
        <p className="text-xs text-neutral-500">
          {product.brand ? `${product.brand} · ` : ""}KDV %{product.vatRate}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {product.variants.map((v) => {
          const orderable =
            v.netUnitPrice !== null && v.stock >= v.moqUnits;
          return (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 rounded-md bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-800/60"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{variantLabel(v)}</p>
                <p className="text-xs text-neutral-500">
                  {v.sku} · stok {v.stock} · koli {v.unitsPerCase}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums font-semibold">
                  {v.netUnitPrice !== null ? formatTRY(v.netUnitPrice) : "—"}
                </span>
                <button
                  type="button"
                  disabled={!orderable}
                  onClick={() =>
                    add({
                      variantId: v.id,
                      sku: v.sku,
                      productName: product.name,
                      color: v.color,
                      size: v.size,
                      unitsPerCase: v.unitsPerCase,
                      moqUnits: v.moqUnits,
                      stock: v.stock,
                      netUnitPrice: Number(v.netUnitPrice),
                      vatRate: product.vatRate,
                    })
                  }
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-900"
                >
                  {orderable ? "Sepete ekle" : "Yok"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
