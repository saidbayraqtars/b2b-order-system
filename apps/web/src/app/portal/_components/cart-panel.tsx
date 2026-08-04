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
  const lines = useCart((s) => s.lines);
  const inc = useCart((s) => s.inc);
  const dec = useCart((s) => s.dec);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
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
    <aside className="sticky top-4 flex h-fit flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold">Sepet</h2>

      {result && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
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

      {lines.length === 0 ? (
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
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => dec(l.variantId)}
                    className="h-6 w-6 rounded border border-neutral-300 dark:border-neutral-700"
                  >
                    −
                  </button>
                  <span className="w-12 text-center tabular-nums">{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => inc(l.variantId)}
                    className="h-6 w-6 rounded border border-neutral-300 dark:border-neutral-700"
                  >
                    +
                  </button>
                </div>
                <span className="tabular-nums font-medium">
                  {formatTRY(l.netUnitPrice * l.quantity)}
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
              <span className="mb-1 block text-xs text-neutral-500">Kupon kodu</span>
              <input
                value={couponDraft}
                onChange={(e) => setCouponDraft(e.target.value.toUpperCase())}
                placeholder="KUPON25"
                disabled={coupon !== null}
                className="h-8 w-full rounded-md border border-neutral-300 px-2 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            {coupon === null ? (
              <button
                type="button"
                disabled={couponDraft.trim().length < 3}
                onClick={() => setCoupon(couponDraft.trim())}
                className="h-8 rounded-md border border-neutral-300 px-3 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
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
                className="h-8 rounded-md border border-neutral-300 px-3 text-xs font-medium dark:border-neutral-700"
              >
                Kaldır
              </button>
            )}
          </div>

          {quote.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
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
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
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
    <div className={`flex justify-between gap-2 ${bold ? "font-semibold" : ""}`}>
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
        className={`tabular-nums ${accent ? "text-emerald-700 dark:text-emerald-400" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
