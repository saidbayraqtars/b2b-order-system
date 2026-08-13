"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Package, ShoppingCart } from "lucide-react";
import type { CatalogProduct, CatalogVariant } from "@repo/services";
import { useCart, normalizeQty } from "@/store/cart";
import { formatTRY } from "@/lib/format";
import { CurrencyNote } from "@/components/currency-note";
import { cn } from "@/lib/utils";

// Ürün detayı — vitrinin teknik kimliği: sol tarafta görsel, sağda künye ve
// varyant tablosu. Toptan siparişte asıl iş varyant tablosunda dönüyor, o
// yüzden tablo perakende sitelerindeki gibi gizlenmiyor: her satırda SKU,
// stok, koli, fiyat ve kendi adet kutusu var.

function variantLabel(v: CatalogVariant): string {
  const parts = [v.color, v.size].filter(Boolean);
  return parts.length ? parts.join(" · ") : v.sku;
}

export function ProductDetail({
  product,
  companyId,
  categoryName,
}: {
  product: CatalogProduct;
  companyId: string;
  categoryName: string | null;
}) {
  const [activeImage, setActiveImage] = useState(0);
  const totalStock = product.variants.reduce((s, v) => s + v.stock, 0);

  return (
    <div>
      <nav className="flex items-center gap-2 py-4">
        <Link
          href={`/portal?companyId=${encodeURIComponent(companyId)}`}
          className="tech-label flex items-center gap-1.5 transition-colors hover:text-brand-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Katalog
        </Link>
        {categoryName && (
          <>
            <span className="tech-label">/</span>
            <span className="tech-label">{categoryName}</span>
          </>
        )}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Görsel */}
        <div>
          <div className="aspect-square border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            {product.images[activeImage] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.images[activeImage]}
                alt={product.name}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-10 w-10 text-neutral-300 dark:text-neutral-700" />
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {product.images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`Görsel ${i + 1}`}
                  className={cn(
                    "h-16 w-16 border bg-white transition-colors dark:bg-neutral-900",
                    i === activeImage
                      ? "border-brand-600"
                      : "border-neutral-300 hover:border-neutral-400 dark:border-neutral-700",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Künye + varyantlar */}
        <div>
          <p className="tech-label">
            {product.brand ?? "—"} · KDV %{product.vatRate}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold leading-tight">
            {product.name}
          </h1>

          <dl className="mt-4 grid grid-cols-3 border border-neutral-300 dark:border-neutral-700">
            <Spec label="Varyant" value={String(product.variants.length)} />
            <Spec
              label="Toplam stok"
              value={String(totalStock)}
              muted={totalStock === 0}
            />
            <Spec label="KDV" value={`%${product.vatRate}`} last />
          </dl>

          <p className="tech-label mt-6 mb-2">Varyantlar</p>
          <div className="border border-neutral-300 dark:border-neutral-700">
            {product.variants.map((v, i) => (
              <VariantRow
                key={v.id}
                variant={v}
                companyId={companyId}
                first={i === 0}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Spec({
  label,
  value,
  muted,
  last,
}: {
  label: string;
  value: string;
  muted?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-3 py-2",
        !last && "border-r border-neutral-300 dark:border-neutral-700",
      )}
    >
      <dt className="tech-label">{label}</dt>
      <dd
        className={cn(
          "tech-num mt-0.5 text-sm font-semibold",
          muted && "text-neutral-400",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function VariantRow({
  variant: v,
  companyId,
  first,
}: {
  variant: CatalogVariant;
  companyId: string;
  first: boolean;
}) {
  const { lines, setQty } = useCart(companyId);
  const inCart = lines.find((l) => l.variantId === v.id);

  // Başlangıç adedi: koli katına yuvarlanmış MOQ. Kullanıcı serbest sayı
  // yazabilir; sepete basınca aynı kural sunucuda da uygulanır.
  const step = Math.max(v.moqUnits, v.unitsPerCase, 1);
  const [qty, setLocalQty] = useState(step);

  const priced = v.netUnitPrice !== null;
  const orderable = priced && v.stock >= v.moqUnits;
  const lineTotal = priced ? Number(v.netUnitPrice) * qty : 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 px-3 py-2.5",
        !first && "border-t border-neutral-200 dark:border-neutral-800",
        !orderable && "bg-neutral-50 dark:bg-neutral-900/50",
      )}
    >
      <div className="min-w-[8rem] flex-1">
        <p className="text-sm font-medium">{variantLabel(v)}</p>
        <p className="tech-num mt-0.5 text-[10px] text-neutral-500">
          {v.sku}
          {v.barcode ? ` · ${v.barcode}` : ""}
        </p>
      </div>

      <div className="tech-num text-right text-[11px] text-neutral-500">
        <p>STK {v.stock}</p>
        <p>KOL {v.unitsPerCase}</p>
      </div>

      <div className="tech-num min-w-[5.5rem] text-right">
        <p className="text-sm font-bold">
          {priced ? formatTRY(v.netUnitPrice!) : "—"}
        </p>
        {/* Dövizle listelenen ürünün orijinal fiyatı — karttakiyle aynı not.
            Tahsil edilen tutar her zaman yukarıdaki TL. */}
        <CurrencyNote
          currency={v.listCurrency}
          amount={v.listUnitPrice}
          className="block text-[10px] text-neutral-500"
        />
        {v.discountPerUnit && Number(v.discountPerUnit) > 0 && (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
            −{formatTRY(v.discountPerUnit)}
          </p>
        )}
      </div>

      {orderable ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={v.moqUnits}
            step={v.unitsPerCase}
            value={qty}
            onChange={(e) => setLocalQty(Number(e.target.value))}
            onBlur={() => setLocalQty(normalizeQty(v, qty))}
            aria-label={`${variantLabel(v)} adet`}
            className="tech-num h-8 w-20 border border-neutral-300 bg-white px-2 text-right text-xs outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="tech-num hidden min-w-[5.5rem] text-right text-xs font-semibold sm:block">
            {formatTRY(lineTotal)}
          </span>
          <button
            type="button"
            onClick={() => setQty(v.id, normalizeQty(v, qty))}
            className="inline-flex h-8 items-center gap-1.5 bg-brand-600 px-3 font-mono text-[11px] font-medium uppercase tracking-wider text-white transition-colors hover:bg-brand-700"
          >
            {inCart ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Güncelle
              </>
            ) : (
              <>
                <ShoppingCart className="h-3.5 w-3.5" />
                Ekle
              </>
            )}
          </button>
        </div>
      ) : (
        <span className="tech-label text-neutral-400">
          {priced ? "stok yok" : "fiyat tanımsız"}
        </span>
      )}
    </div>
  );
}
