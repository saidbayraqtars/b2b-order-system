"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CreateOrderResult, OrderQuoteView, PaymentOptions } from "@repo/services";
import type { PaymentMethod } from "@repo/types";
import { useCart, cartTotals } from "@/store/cart";
import { formatTRY } from "@/lib/format";
import { apiGet, apiPost } from "@/lib/fetcher";

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
  const [method, setMethod] = useState<PaymentMethod>("OPEN_ACCOUNT");
  const [termId, setTermId] = useState("");

  const items = lines.map((l) => ({
    variantId: l.variantId,
    quantity: l.quantity,
  }));

  // What this customer is allowed to pick. The server re-checks the choice when
  // pricing, so this call only decides what to *render*.
  const options = useQuery({
    queryKey: ["payment-options", companyId],
    queryFn: () =>
      apiGet<PaymentOptions>(
        `/api/payment-options?companyId=${encodeURIComponent(companyId)}`,
      ),
  });

  // Memoised because both feed effect dependencies: a fresh array on every
  // render would re-run the guards below on each keystroke in the panel.
  const methods = useMemo(() => options.data?.methods ?? [], [options.data]);
  // Vade is only meaningful on a sale that goes on the cari — a due date on an
  // already-paid order is refused server-side, so it is not offered here.
  const termsOffered = useMemo(() => {
    const selected = methods.find((m) => m.value === method);
    return selected?.createsReceivable ? (options.data?.terms ?? []) : [];
  }, [methods, method, options.data]);

  // A customer restricted to, say, cash only would otherwise sit on the
  // OPEN_ACCOUNT default and get a rejection at checkout with no way to fix it.
  useEffect(() => {
    if (methods.length > 0 && !methods.some((m) => m.value === method)) {
      setMethod(methods[0]!.value);
    }
  }, [methods, method]);

  // Switching to a prepaid method has to drop the vade with it; leaving it set
  // would post a term the server refuses for that method.
  useEffect(() => {
    if (termId && !termsOffered.some((t) => t.id === termId)) setTermId("");
  }, [termsOffered, termId]);

  const settlement = {
    paymentMethod: method,
    ...(termId ? { paymentTermId: termId } : {}),
  };

  // Campaigns are evaluated server-side, so the cart cannot total itself any
  // more: it asks for a quote and shows exactly what the order will charge.
  // The local total stays as the fallback while that request is in flight.
  //
  // Method and term are part of the key: a campaign can depend on how the order
  // is paid, so changing the method has to re-price the basket.
  const quote = useQuery({
    queryKey: ["order-quote", companyId, items, coupon, method, termId],
    enabled: lines.length > 0,
    queryFn: () =>
      apiPost<OrderQuoteView>("/api/orders/quote", {
        companyId,
        ...settlement,
        ...(coupon ? { couponCode: coupon } : {}),
        items,
      }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<CreateOrderResult>("/api/orders", {
        companyId,
        ...settlement,
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
    <aside className="sticky top-20 flex h-fit flex-col gap-4 border border-border-strong bg-surface p-4">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="tech-label text-fg">
          Sepet
        </h2>
        <span className="tech-num text-xs text-fg-muted">
          {lines.length} kalem
        </span>
      </div>

      {result && (
        <div className="bg-success-soft p-3 text-sm text-success">
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
        <p className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          {(mutation.error as Error).message}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-fg-muted">Sepet yükleniyor…</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-fg-muted">Sepetiniz boş.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lines.map((l) => (
            <li key={l.variantId} className="text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.productName}</p>
                  <p className="text-xs text-fg-muted">{l.sku}</p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(l.variantId)}
                  className="text-xs text-fg-muted hover:text-danger"
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
                    className="h-6 w-6 border border-border-strong font-mono text-xs transition-colors hover:bg-surface3"
                  >
                    −
                  </button>
                  <span className="tech-num w-12 border-y border-border-strong py-0.5 text-center text-xs">
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => inc(l.variantId)}
                    aria-label="Artır"
                    className="h-6 w-6 border border-border-strong font-mono text-xs transition-colors hover:bg-surface3"
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
        <div className="flex flex-col gap-3 border-t border-border pt-3 text-sm">
          {methods.length > 0 && (
            <label className="block">
              <span className="tech-label mb-1 block">Ödeme yöntemi</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="h-8 w-full border border-border-strong bg-surface2 px-2 text-xs text-fg outline-none focus:border-primary"
              >
                {methods.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {termsOffered.length > 0 && (
            <label className="block">
              <span className="tech-label mb-1 block">Vade</span>
              <select
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                className="h-8 w-full border border-border-strong bg-surface2 px-2 text-xs text-fg outline-none focus:border-primary"
              >
                <option value="">
                  Varsayılan ({options.data?.defaultTermDays ?? 0} gün)
                </option>
                {termsOffered.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.days === 0 ? "peşin" : `${t.days} gün`})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="tech-label mb-1 block">Kupon kodu</span>
              <input
                value={couponDraft}
                onChange={(e) => setCouponDraft(e.target.value.toUpperCase())}
                placeholder="KUPON25"
                disabled={coupon !== null}
                className="tech-num h-8 w-full border border-border-strong bg-surface2 px-2 text-xs text-fg outline-none focus:border-primary disabled:opacity-60"
              />
            </label>
            {coupon === null ? (
              <button
                type="button"
                disabled={couponDraft.trim().length < 3}
                onClick={() => setCoupon(couponDraft.trim())}
                className="h-8 border border-border-strong px-3 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-surface3 disabled:opacity-50"
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
                className="h-8 border border-border-strong px-3 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-surface3"
              >
                Kaldır
              </button>
            )}
          </div>

          {quote.isError && (
            <p className="bg-danger-soft px-3 py-2 text-xs text-danger">
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
            {priced && q.volumeDiscount && (
              // Named, not subtracted: "Ara toplam" above is already net of it.
              // Showing it as its own deduction row would read as a second
              // discount the customer never gets.
              <p className="text-xs text-success">
                Hacim iskontosu — {q.volumeDiscount.tierName} (%
                {q.volumeDiscount.percent}), ara toplama dahil: −
                {formatTRY(Number(q.volumeDiscount.amount))}
              </p>
            )}
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
              <p className="text-xs text-fg-muted">Fiyat güncelleniyor…</p>
            )}
            {priced && (
              // What the settlement actually resolved to, straight from the
              // quote — the buyer should see the vade before ordering, not
              // discover it on the invoice.
              <p className="mt-1 text-xs text-fg-muted">
                {q.createsReceivable
                  ? q.paymentTermDays > 0
                    ? `Cari hesaba işlenir · ${q.paymentTermDays} gün vade`
                    : "Cari hesaba işlenir · peşin"
                  : "Sipariş anında ödenir — cari hesaba işlenmez"}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={mutation.isPending || quote.isError || quote.isLoading}
            onClick={() => mutation.mutate()}
            className="bg-primary px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
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
      className={`flex justify-between gap-2 text-xs ${bold ? "border-t border-border pt-1.5 text-sm font-bold" : ""}`}
    >
      <span
        className={
          accent
            ? "truncate text-success"
            : bold
              ? ""
              : "text-fg-muted"
        }
      >
        {label}
      </span>
      <span
        className={`tech-num ${accent ? "text-success" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
