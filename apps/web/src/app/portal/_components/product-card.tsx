"use client";

import Link from "next/link";
import { ImageOff, Plus } from "lucide-react";
import type { CatalogProduct, CatalogVariant } from "@repo/services";
import { useCart } from "@/store/cart";
import { formatTRY } from "@/lib/format";
import { mediaSrc, mediaSrcSet } from "@/lib/media";
import { CurrencyNote } from "@/components/currency-note";
import { cn } from "@/lib/utils";

/**
 * Vitrin ürün kartı.
 *
 * Kart artık üç varyant satırını üzerinde taşımıyor. Sebebi kalabalık değil,
 * yanlış vaat: üç satır gösterip dördüncüyü "+2 varyant daha" diye saklamak,
 * ızgarayı tarayan kişiye kartın tam künye olduğunu düşündürüyordu. Tek
 * varyantlı ürün — katalogun büyük çoğunluğu — karttan doğrudan sepete girer;
 * çok varyantlı ürünün sepet düğmesi detaya götürür, çünkü hangi varyantın
 * istendiği kartta cevaplanamaz.
 *
 * Görsel kutusu kare ve `object-contain`: toptan katalogda fotoğraflar farklı
 * oranlarda geliyor, kırpmak etiketi ya da kapağı kesiyordu.
 */

/** Kartın künye satırı: tek varyantta SKU, çoklu varyantta adet. */
function codeLabel(product: CatalogProduct): string {
  const first = product.variants[0];
  if (product.variants.length === 1 && first) return `KOD: ${first.sku}`;
  if (product.variants.length === 0) return "VARYANT YOK";
  return `${product.variants.length} VARYANT`;
}

/** Kartta özet olarak gösterilecek fiyat: en düşük satılabilir birim fiyat. */
function priceRange(product: CatalogProduct): {
  from: string | null;
  multiple: boolean;
} {
  const prices = product.variants
    .map((v) => v.netUnitPrice)
    .filter((p): p is string => p !== null)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (prices.length === 0) return { from: null, multiple: false };
  const min = Math.min(...prices);
  return { from: formatTRY(min), multiple: Math.max(...prices) > min };
}

/**
 * Stok işareti.
 *
 * Sınırın koli büyüklüğüne bağlanması bilinçli: toptancı için "az kaldı" mutlak
 * bir adet değil, birkaç koli demek. 12'li kolide 40 adet azdır, 1'lik kolide
 * değildir.
 */
function stockNote(product: CatalogProduct): {
  label: string;
  tone: "positive" | "caution" | "critical";
} {
  const total = product.variants.reduce((s, v) => s + v.stock, 0);
  if (total <= 0) return { label: "Stok yok", tone: "critical" };
  const perCase = Math.max(1, ...product.variants.map((v) => v.unitsPerCase));
  if (total <= perCase * 5) {
    return { label: `Sınırlı stok (${total} adet)`, tone: "caution" };
  }
  return { label: `Stokta var (${total} adet)`, tone: "positive" };
}

/** Karttan doğrudan sepete girebilecek tek varyant — yoksa null. */
function soleOrderableVariant(product: CatalogProduct): CatalogVariant | null {
  if (product.variants.length !== 1) return null;
  const v = product.variants[0]!;
  return v.netUnitPrice !== null && v.stock >= v.moqUnits ? v : null;
}

const STOCK_TONE = {
  positive: "text-positive",
  caution: "text-caution",
  critical: "text-critical",
} as const;

export function ProductCard({
  product,
  companyId,
  categoryName,
}: {
  product: CatalogProduct;
  companyId: string;
  /** Görselin üstündeki künye. Yoksa marka, o da yoksa hiç çizilmez. */
  categoryName?: string | null;
}) {
  const { add } = useCart(companyId);
  const { from, multiple } = priceRange(product);
  const stock = stockNote(product);
  const sole = soleOrderableVariant(product);
  // Seçili firma detay sayfasına da taşınır; plasiyer ürüne tıklayınca hangi
  // firma adına çalıştığını kaybetmemeli.
  const detailHref = `/portal/urun/${product.id}?companyId=${encodeURIComponent(companyId)}`;
  const tag = categoryName ?? product.brand;

  return (
    <article className="group flex flex-col rounded-lg border border-line bg-panel transition-colors hover:border-line-strong">
      <Link href={detailHref} className="block p-3 pb-0">
        <div className="relative aspect-square overflow-hidden rounded bg-sunken">
          {product.images[0] ? (
            // Görseller kendi rotamızdan, aynı kaynaktan ve değişmez servis
            // ediliyor; next/image burada kazanç sağlamadan loader isterdi.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaSrc(product.images[0], 320)}
              srcSet={mediaSrcSet(product.images[0], 320)}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageOff className="h-6 w-6 text-ink-faint" aria-hidden />
              <span className="sr-only">Görsel yok</span>
            </div>
          )}

          {tag && (
            <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              {tag}
            </span>
          )}

          {stock.tone === "critical" && (
            <span className="absolute inset-x-0 bottom-0 bg-accent/85 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-on-accent">
              Tükendi
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <p className="tech-label truncate">{codeLabel(product)}</p>
        <h3 className="mt-1 text-body-sm font-semibold leading-snug text-ink">
          <Link href={detailHref} className="line-clamp-2 hover:underline">
            {product.name}
          </Link>
        </h3>

        <p
          className={cn(
            "mt-1.5 flex items-center gap-1.5 text-xs tabular-nums",
            STOCK_TONE[stock.tone],
          )}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
          />
          {stock.label}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span className="min-w-0">
            {from ? (
              <span className="block text-body-lg font-bold tabular-nums text-ink">
                {from}
                {multiple && (
                  <span className="ml-1 text-xs font-normal text-ink-faint">
                    &apos;den
                  </span>
                )}
              </span>
            ) : (
              <span className="block text-body-sm text-ink-faint">
                Fiyat tanımsız
              </span>
            )}
            {/*
              Dövizle listelenen ürünün orijinal fiyatı: müşteri dolarla
              anlaştıysa hangi sayıdan çevrildiğini görmek istiyor. Tahsil
              edilen tutar her zaman yukarıdaki TL.
            */}
            {product.variants.length === 1 && product.variants[0] && (
              <CurrencyNote
                currency={product.variants[0].listCurrency}
                amount={product.variants[0].listUnitPrice}
                className="block text-[10px] text-ink-faint"
              />
            )}
          </span>

          {sole ? (
            <button
              type="button"
              title="Sepete ekle"
              aria-label={`${product.name} sepete ekle`}
              onClick={() =>
                add({
                  variantId: sole.id,
                  unitsPerCase: sole.unitsPerCase,
                  moqUnits: sole.moqUnits,
                  stock: sole.stock,
                })
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent text-on-accent transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : product.variants.length > 1 ? (
            <Link
              href={detailHref}
              title="Varyant seçin"
              aria-label={`${product.name} varyantlarını aç`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
            >
              <Plus className="h-4 w-4" />
            </Link>
          ) : (
            <span
              title="Sipariş edilemez"
              className="flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded border border-line text-ink-faint opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
