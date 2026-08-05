"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { CatalogProduct, CatalogVariant } from "@repo/services";
import { useCart } from "@/store/cart";
import { formatTRY } from "@/lib/format";
import { cn } from "@/lib/utils";

// Vitrin ürün kartı — endüstriyel/teknik kimlik: ölçen her sayı (SKU, fiyat,
// stok, koli) monospace ve sekmeli, kartlar arasında rakamlar hizalanıyor.
// Kart artık ürün detayına da bağlanıyor; hızlı sipariş için varyant satırları
// yerinde duruyor.

function variantLabel(v: CatalogVariant): string {
  const parts = [v.color, v.size].filter(Boolean);
  return parts.length ? parts.join(" · ") : v.sku;
}

/** Kartta özet olarak gösterilecek fiyat: en düşük satılabilir birim fiyat. */
function fromPrice(product: CatalogProduct): string | null {
  const prices = product.variants
    .map((v) => v.netUnitPrice)
    .filter((p): p is string => p !== null)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return prices.length ? formatTRY(Math.min(...prices)) : null;
}

export function ProductCard({
  product,
  companyId,
}: {
  product: CatalogProduct;
  companyId: string;
}) {
  const { add } = useCart(companyId);
  const price = fromPrice(product);
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  // Seçili firma detay sayfasına da taşınır; plasiyer ürüne tıklayınca hangi
  // firma adına çalıştığını kaybetmemeli.
  const detailHref = `/portal/urun/${product.id}?companyId=${encodeURIComponent(companyId)}`;

  return (
    <article className="group flex flex-col border border-neutral-300 bg-white transition-colors hover:border-brand-500 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-brand-500">
      <Link href={detailHref} className="block">
        <div className="relative aspect-[4/3] overflow-hidden border-b border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800">
          {product.images[0] ? (
            // Görseller kendi rotamızdan, aynı kaynaktan ve değişmez servis
            // ediliyor; next/image burada kazanç sağlamadan loader isterdi.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.images[0]}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="tech-label">görsel yok</span>
            </div>
          )}
          {totalStock === 0 && (
            <span className="absolute left-0 top-0 bg-neutral-900 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
              stok yok
            </span>
          )}
        </div>

        <div className="border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
          <p className="tech-label truncate">
            {product.brand ?? "—"} · KDV %{product.vatRate}
          </p>
          <h3 className="mt-0.5 truncate text-sm font-semibold leading-snug text-neutral-900 group-hover:text-brand-700 dark:text-neutral-100 dark:group-hover:text-brand-400">
            {product.name}
          </h3>
          <p className="tech-num mt-1.5 text-base font-bold text-neutral-900 dark:text-white">
            {price ? (
              <>
                {price}
                <span className="tech-label ml-1.5 font-normal">&apos;den</span>
              </>
            ) : (
              <span className="text-sm font-normal text-neutral-400">
                fiyat tanımsız
              </span>
            )}
          </p>
        </div>
      </Link>

      {/* Varyant satırları: teknik künye + tek tıkla sepete. */}
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {product.variants.slice(0, 3).map((v) => {
          const orderable = v.netUnitPrice !== null && v.stock >= v.moqUnits;
          return (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
                  {variantLabel(v)}
                </p>
                <p className="tech-num mt-0.5 text-[10px] text-neutral-500">
                  {v.sku} · STK {v.stock} · KOL {v.unitsPerCase}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tech-num text-xs font-semibold">
                  {v.netUnitPrice !== null ? formatTRY(v.netUnitPrice) : "—"}
                </span>
                <button
                  type="button"
                  disabled={!orderable}
                  title={orderable ? "Sepete ekle" : "Sipariş edilemez"}
                  aria-label={`${variantLabel(v)} sepete ekle`}
                  onClick={() =>
                    add({
                      variantId: v.id,
                      unitsPerCase: v.unitsPerCase,
                      moqUnits: v.moqUnits,
                      stock: v.stock,
                    })
                  }
                  className={cn(
                    "flex h-7 w-7 items-center justify-center border transition-colors",
                    orderable
                      ? "border-brand-600 bg-brand-600 text-white hover:bg-brand-700"
                      : "cursor-not-allowed border-neutral-300 text-neutral-300 dark:border-neutral-700 dark:text-neutral-600",
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {product.variants.length > 3 && (
        <Link
          href={`/portal/urun/${product.id}`}
          className="tech-label border-t border-neutral-200 px-3 py-2 text-center transition-colors hover:bg-neutral-50 hover:text-brand-600 dark:border-neutral-800 dark:hover:bg-neutral-800"
        >
          +{product.variants.length - 3} varyant daha →
        </Link>
      )}
    </article>
  );
}
