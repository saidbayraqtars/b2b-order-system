"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Package, ShoppingCart } from "lucide-react";
import type { CatalogProduct, CatalogVariant } from "@repo/services";
import { useCart, normalizeQty } from "@/store/cart";
import { formatQuantity, formatTRY } from "@/lib/format";
import { isFractional, quantityStep } from "@/lib/quantity";
import { mediaSrc, mediaSrcSet } from "@/lib/media";
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
          className="tech-label flex items-center gap-1.5 transition-colors hover:text-ink"
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
          <div className="aspect-square overflow-hidden rounded-lg border border-line bg-sunken">
            {product.images[activeImage] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaSrc(product.images[activeImage]!, 640)}
                srcSet={mediaSrcSet(product.images[activeImage]!, 640)}
                alt={product.name}
                className="h-full w-full object-contain p-6"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-10 w-10 text-ink-faint" />
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
                    "h-16 w-16 overflow-hidden rounded border bg-sunken transition-colors",
                    i === activeImage
                      ? "border-accent"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaSrc(src, 160)}
                    alt=""
                    loading="lazy"
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
          <h1 className="mt-1 text-headline-md text-ink">{product.name}</h1>

          <dl className="mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-panel">
            <Spec label="Varyant" value={String(product.variants.length)} />
            <Spec
              label="Toplam stok"
              value={String(totalStock)}
              muted={totalStock === 0}
            />
            <Spec label="KDV" value={`%${product.vatRate}`} last />
          </dl>

          <p className="tech-label mb-2 mt-6">Varyantlar</p>
          <div className="overflow-hidden rounded-lg border border-line bg-panel">
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
    <div className={cn("px-3 py-2", !last && "border-r border-line")}>
      <dt className="tech-label">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-body-sm font-semibold tabular-nums text-ink",
          muted && "text-ink-faint",
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
        !first && "border-t border-line",
        !orderable && "bg-sunken",
      )}
    >
      <div className="min-w-[8rem] flex-1">
        <p className="text-body-sm font-medium text-ink">{variantLabel(v)}</p>
        <p className="mt-0.5 text-[10px] tabular-nums text-ink-faint">
          {v.sku}
          {v.barcode ? ` · ${v.barcode}` : ""}
        </p>
      </div>

      <div className="text-right text-[11px] tabular-nums text-ink-faint">
        <p>
          STK {formatQuantity(v.stock)}
          {v.unit && isFractional(v) ? ` ${v.unit}` : ""}
        </p>
        <p>KOL {v.unitsPerCase}</p>
      </div>

      <div className="min-w-[5.5rem] text-right tabular-nums">
        <p className="text-body-sm font-bold text-ink">
          {priced ? formatTRY(v.netUnitPrice!) : "—"}
        </p>
        {/* Dövizle listelenen ürünün orijinal fiyatı — karttakiyle aynı not.
            Tahsil edilen tutar her zaman yukarıdaki TL. */}
        <CurrencyNote
          currency={v.listCurrency}
          amount={v.listUnitPrice}
          className="block text-[10px] text-ink-faint"
        />
        {v.discountPerUnit && Number(v.discountPerUnit) > 0 && (
          <p className="text-[10px] text-positive">
            −{formatTRY(v.discountPerUnit)}
          </p>
        )}
      </div>

      {orderable ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={v.moqUnits}
            step={quantityStep(v)}
            inputMode={isFractional(v) ? "decimal" : "numeric"}
            value={qty}
            onChange={(e) => setLocalQty(Number(e.target.value))}
            onBlur={() => setLocalQty(normalizeQty(v, qty))}
            aria-label={`${variantLabel(v)} adet`}
            className="h-8 w-20 rounded border border-line bg-panel px-2 text-right text-xs tabular-nums text-ink outline-none transition-colors hover:border-line-strong focus:border-ink-muted"
          />
          <span className="hidden min-w-[5.5rem] text-right text-xs font-semibold tabular-nums text-ink sm:block">
            {formatTRY(lineTotal)}
          </span>
          <button
            type="button"
            onClick={() => setQty(v.id, normalizeQty(v, qty))}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-accent px-3 text-xs font-medium text-on-accent transition-opacity hover:opacity-90"
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
        <span className="tech-label">
          {priced ? "stok yok" : "fiyat tanımsız"}
        </span>
      )}
    </div>
  );
}
