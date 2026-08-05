"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CreateOrderResult, OrderQuoteView } from "@repo/services";
import { useCart, cartTotals } from "@/store/cart";
import { formatTRY } from "@/lib/format";
import { apiPost } from "@/lib/fetcher";

const STATUS_MESSAGE: Record<string, string> = {
  CONFIRMED: "Siparişiniz onaylandı ve işleme alındı.",
  PENDING_APPROVAL: "Sipariş, firma yöneticisi onayı bekliyor.",
  PENDING_CREDIT: "Kredi limiti aşıldı — yönetici onayı bekleniyor.",
};

export function CartPanel({ companyId }: { companyId: string }) {
  const { lines, inc, dec, remove, clear, isLoading } = useCart(companyId);
  const localTotals = cartTotals(lines);

  const [couponDraft, setCouponDraft] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);

  const items = lines.map((l) => ({
    variantId: l.variantId,
    quantity: l.quantity,
  }));

  // Campaigns are evaluated server-side, so the cart cannot total itself any
  // more: it asks for a quote and shows exactly what the order will charge.
  // The local total stays as the fallback while that request is in flight.
  const quote = useQuery({
    queryKey: ["order-quote", companyId, items, coupon],
    enabled: lines.length > 0,
    queryFn: () =>
      apiPost<OrderQuoteView>("/api/orders/quote", {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        ...(coupon ? { couponCode: coupon } : {}),
        items,
      }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<CreateOrderResult>("/api/orders", {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        ...(coupon ? { couponCode: coupon } : {}),
        items,
      }),
    onSuccess: () => {
      clear();
      setCoupon(null);
      setCouponDraft("");
    },
  });

  const result = mutation.data;
  const q = quote.data;
  const priced = q !== undefined;

  return (
    <aside className="sticky top-20 flex h-fit flex-col gap-4 border border-neutral-300 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-baseline justify-between border-b border-neutral-200 pb-2 dark:border-neutral-800">
        <h2 className="tech-label text-neutral-900 dark:text-neutral-100">
          Sepet
        </h2>
        <span className="tech-num text-xs text-neutral-500">
          {lines.length} kalem
        </span>
      </div>

      {result && (
        <div className="bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <p className="font-medium">
            <Link href={`/orders/${result.orderId}`} className="underline">
              Sipariş #{result.orderNumber}
            </Link>
          </p>
          <p>{STATUS_MESSAGE[result.status] ?? result.status}</p>
          {result.promotions.length > 0 && (
            <p className="mt-1">
              Kampanya indirimi: {formatTRY(Number(result.promotionTotal))}
            </p>
          )}
        </div>
      )}
      {mutation.isError && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {(mutation.error as Error).message}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Sepet yükleniyor…</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-neutral-500">Sepetiniz boş.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lines.map((l) => (
            <li key={l.variantId} className="text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.productName}</p>
                  <p className="text-xs text-neutral-500">{l.sku}</p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(l.variantId)}
                  className="text-xs text-neutral-400 hover:text-red-600"
                >
                  Kaldır
                </button>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => dec(l.variantId)}
                    aria-label="Azalt"
                    className="h-6 w-6 border border-neutral-300 font-mono text-xs transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    −
                  </button>
                  <span className="tech-num w-12 border-y border-neutral-300 py-0.5 text-center text-xs dark:border-neutral-700">
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => inc(l.variantId)}
                    aria-label="Artır"
                    className="h-6 w-6 border border-neutral-300 font-mono text-xs transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    +
                  </button>
                </div>
                <span className="tech-num text-xs font-semibold">
                  {l.netUnitPrice === null
                    ? "fiyat yok"
                    : formatTRY(Number(l.netUnitPrice) * l.quantity)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="tech-label mb-1 block">Kupon kodu</span>
              <input
                value={couponDraft}
                onChange={(e) => setCouponDraft(e.target.value.toUpperCase())}
                placeholder="KUPON25"
                disabled={coupon !== null}
                className="tech-num h-8 w-full border border-neutral-300 px-2 text-xs outline-none focus:border-brand-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            {coupon === null ? (
              <button
                type="button"
                disabled={couponDraft.trim().length < 3}
                onClick={() => setCoupon(couponDraft.trim())}
                className="h-8 border border-neutral-300 px-3 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Uygula
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCoupon(null);
                  setCouponDraft("");
                }}
                className="h-8 border border-neutral-300 px-3 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Kaldır
              </button>
            )}
          </div>

          {quote.isError && (
            <p className="bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {(quote.error as Error).message}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <Row
              label="Ara toplam"
              value={formatTRY(
                priced ? Number(q.subtotal) - Number(q.discountTotal) : localTotals.subtotal,
              )}
            />
            {priced &&
              q.promotions.map((p) => (
                <Row
                  key={p.promotionId}
                  label={`Kampanya: ${p.name}`}
                  value={`− ${formatTRY(Number(p.amount))}`}
                  accent
                />
              ))}
            <Row
              label="KDV"
              value={formatTRY(priced ? Number(q.taxTotal) : localTotals.taxTotal)}
            />
            <Row
              label="Genel toplam"
              value={formatTRY(
                priced ? Number(q.grandTotal) : localTotals.grandTotal,
              )}
              bold
            />
            {quote.isFetching && (
              <p className="text-xs text-neutral-400">Fiyat güncelleniyor…</p>
            )}
          </div>

          <button
            type="button"
            disabled={mutation.isPending || quote.isError || quote.isLoading}
            onClick={() => mutation.mutate()}
            className="bg-brand-600 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {mutation.isPending ? "Gönderiliyor…" : "Siparişi oluştur"}
          </button>
        </div>
      )}
    </aside>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-2 text-xs ${bold ? "border-t border-neutral-200 pt-1.5 text-sm font-bold dark:border-neutral-800" : ""}`}
    >
      <span
        className={
          accent
            ? "truncate text-emerald-700 dark:text-emerald-400"
            : bold
              ? ""
              : "text-neutral-500"
        }
      >
        {label}
      </span>
      <span
        className={`tech-num ${accent ? "text-emerald-700 dark:text-emerald-400" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
