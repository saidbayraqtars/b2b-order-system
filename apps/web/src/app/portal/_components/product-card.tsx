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
    <article className="group flex flex-col border border-border-strong bg-surface transition-colors hover:border-primary">
      <Link href={detailHref} className="block">
        <div className="relative aspect-[4/3] overflow-hidden border-b border-border bg-surface3">
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
          {/* Ters kontrast: metin rengi zemin, zemin rengi metin. Paket ne
              olursa olsun okunur kalmasının tek yolu bu ikisini birbirine
              bağlamak — sabit siyah/beyaz koyu bir pakette kaybolurdu. */}
          {totalStock === 0 && (
            <span className="absolute left-0 top-0 bg-fg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-bg">
              stok yok
            </span>
          )}
        </div>

        <div className="border-b border-border px-3 py-2.5">
          <p className="tech-label truncate">
            {product.brand ?? "—"} · KDV %{product.vatRate}
          </p>
          <h3 className="mt-0.5 truncate text-sm font-semibold leading-snug text-fg group-hover:text-primary">
            {product.name}
          </h3>
          <p className="tech-num mt-1.5 text-base font-bold text-fg">
            {price ? (
              <>
                {price}
                <span className="tech-label ml-1.5 font-normal">&apos;den</span>
              </>
            ) : (
              <span className="text-sm font-normal text-fg-muted">
                fiyat tanımsız
              </span>
            )}
          </p>
        </div>
      </Link>

      {/* Varyant satırları: teknik künye + tek tıkla sepete. */}
      <ul className="divide-y divide-border">
        {product.variants.slice(0, 3).map((v) => {
          const orderable = v.netUnitPrice !== null && v.stock >= v.moqUnits;
          return (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-fg">
                  {variantLabel(v)}
                </p>
                <p className="tech-num mt-0.5 text-[10px] text-fg-muted">
                  {v.sku} · STK {v.stock} · KOL {v.unitsPerCase}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tech-num text-xs font-semibold">
                  {v.netUnitPrice !== null ? formatTRY(v.netUnitPrice) : "—"}
                  {/*
                    Dövizle listelenen ürünün orijinal fiyatı: müşteri dolarla
                    anlaştıysa hangi sayıdan çevrildiğini görmek istiyor.
                    Tahsil edilen tutar her zaman yukarıdaki TL.
                  */}
                  {v.listCurrency && v.listCurrency !== "TRY" && v.listUnitPrice ? (
                    <span className="ml-1 font-normal text-fg-muted">
                      ({v.listUnitPrice} {v.listCurrency})
                    </span>
                  ) : null}
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
                      ? "border-primary bg-primary text-on-primary hover:bg-primary/90"
                      : "cursor-not-allowed border-border-strong text-fg-muted",
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
          className="tech-label border-t border-border px-3 py-2 text-center transition-colors hover:bg-surface3 hover:text-primary"
        >
          +{product.variants.length - 3} varyant daha →
        </Link>
      )}
    </article>
  );
}
