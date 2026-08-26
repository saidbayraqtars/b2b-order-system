"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import type {
  CreateOrderResult,
  OrderQuoteView,
  PaymentOptions,
} from "@repo/services";
import type { PaymentMethod } from "@repo/types";
import { useCart, cartTotals } from "@/store/cart";
import { formatTRY } from "@/lib/format";
import { CurrencyNote } from "@/components/currency-note";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Select, TextInput } from "@/components/form";
import { LoadingState } from "@/components/ui";
import { cn } from "@/lib/utils";

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
    <aside className="sticky top-20 flex h-fit flex-col gap-4">
      <section className="overflow-hidden rounded-lg border border-line bg-panel">
        <header className="flex items-center justify-between gap-2 border-b border-line bg-sunken px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-headline-sm text-ink">
            <ShoppingCart className="h-4 w-4 text-ink-faint" />
            Sepet
          </h2>
          <span className="tech-label tabular-nums">{lines.length} kalem</span>
        </header>

        {result && (
          <div className="border-b border-positive/30 bg-positive/10 px-4 py-3 text-body-sm text-positive">
            <p className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <Link href={`/orders/${result.orderId}`} className="underline">
                Sipariş #{result.orderNumber}
              </Link>
            </p>
            <p className="mt-1">
              {STATUS_MESSAGE[result.status] ?? result.status}
            </p>
            {result.promotions.length > 0 && (
              <p className="mt-1 tabular-nums">
                Kampanya indirimi: {formatTRY(Number(result.promotionTotal))}
              </p>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="px-4">
            <LoadingState label="Sepet yükleniyor…" />
          </div>
        ) : lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-body-sm text-ink-faint">
            Sepetiniz boş.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.variantId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-ink">
                      {l.productName}
                    </p>
                    <p className="tech-label truncate">{l.sku}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(l.variantId)}
                    aria-label={`${l.productName} sepetten çıkar`}
                    title="Kaldır"
                    className="-mr-1 shrink-0 p-1 text-ink-faint transition-colors hover:text-critical"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center">
                    <StepButton
                      label="Azalt"
                      onClick={() => dec(l.variantId)}
                      className="rounded-l border-r-0"
                    >
                      <Minus className="h-3 w-3" />
                    </StepButton>
                    <span className="w-12 border-y border-line py-1 text-center text-xs tabular-nums text-ink">
                      {l.quantity}
                    </span>
                    <StepButton
                      label="Artır"
                      onClick={() => inc(l.variantId)}
                      className="rounded-r border-l-0"
                    >
                      <Plus className="h-3 w-3" />
                    </StepButton>
                  </div>
                  <span className="text-right text-body-sm font-semibold tabular-nums text-ink">
                    {l.netUnitPrice === null
                      ? "fiyat yok"
                      : formatTRY(Number(l.netUnitPrice) * l.quantity)}
                    {/* Kur yok: sepetteki kur henüz donmadı, sipariş
                        verildiğinde donacak. Burada gösterilen sayı bir söz
                        değil, malın hangi para biriminde listelendiği. */}
                    <CurrencyNote
                      currency={l.listCurrency}
                      amount={l.listUnitPrice}
                      prefix="birim"
                      className="block text-[10px] font-normal text-ink-faint"
                    />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lines.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-line bg-panel">
          <header className="border-b border-line bg-sunken px-4 py-2.5">
            <h2 className="text-headline-sm text-ink">Sipariş Özeti</h2>
          </header>

          <div className="flex flex-col gap-3 p-4">
            {methods.length > 0 && (
              <div>
                <Label htmlFor="cart-method">Ödeme yöntemi</Label>
                <Select
                  id="cart-method"
                  size="sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                >
                  {methods.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {termsOffered.length > 0 && (
              <div>
                <Label htmlFor="cart-term">Vade</Label>
                <Select
                  id="cart-term"
                  size="sm"
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                >
                  <option value="">
                    Varsayılan ({options.data?.defaultTermDays ?? 0} gün)
                  </option>
                  {termsOffered.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.days === 0 ? "peşin" : `${t.days} gün`})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="cart-coupon">Kupon kodu</Label>
                <TextInput
                  id="cart-coupon"
                  size="sm"
                  value={couponDraft}
                  onChange={(e) => setCouponDraft(e.target.value.toUpperCase())}
                  placeholder="KUPON25"
                  disabled={coupon !== null}
                  className="tabular-nums"
                />
              </div>
              {coupon === null ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={couponDraft.trim().length < 3}
                  onClick={() => setCoupon(couponDraft.trim())}
                >
                  Uygula
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setCoupon(null);
                    setCouponDraft("");
                  }}
                >
                  Kaldır
                </Button>
              )}
            </div>

            <ErrorLine error={quote.isError ? quote.error : null} />

            <div className="flex flex-col gap-1 border-t border-line pt-3">
              <Row
                label="Ara toplam"
                value={formatTRY(
                  priced
                    ? Number(q.subtotal) - Number(q.discountTotal)
                    : localTotals.subtotal,
                )}
              />
              {priced && q.volumeDiscount && (
                // Named, not subtracted: "Ara toplam" above is already net of
                // it. Showing it as its own deduction row would read as a
                // second discount the customer never gets.
                <p className="text-xs text-positive">
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
                value={formatTRY(
                  priced ? Number(q.taxTotal) : localTotals.taxTotal,
                )}
              />
              <Row
                label="Genel toplam"
                value={formatTRY(
                  priced ? Number(q.grandTotal) : localTotals.grandTotal,
                )}
                bold
              />
              {quote.isFetching && (
                <p className="text-xs text-ink-faint">Fiyat güncelleniyor…</p>
              )}
              {priced && (
                // What the settlement actually resolved to, straight from the
                // quote — the buyer should see the vade before ordering, not
                // discover it on the invoice.
                <p className="mt-1 text-xs text-ink-faint">
                  {q.createsReceivable
                    ? q.paymentTermDays > 0
                      ? `Cari hesaba işlenir · ${q.paymentTermDays} gün vade`
                      : "Cari hesaba işlenir · peşin"
                    : "Sipariş anında ödenir — cari hesaba işlenmez"}
                </p>
              )}
            </div>

            <ErrorLine error={mutation.error} />

            <Button
              className="w-full"
              loading={mutation.isPending}
              disabled={quote.isError || quote.isLoading}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Gönderiliyor…" : "Siparişi oluştur"}
            </Button>
          </div>
        </section>
      )}
    </aside>
  );
}

/** Adet kutusunun iki ucundaki düğme — üçü tek bir kutu gibi görünsün diye. */
function StepButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center border border-line text-ink-muted transition-colors hover:bg-subtle hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
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
      className={cn(
        "flex justify-between gap-2 text-xs",
        bold && "border-t border-line pt-2 text-body-md font-bold text-ink",
      )}
    >
      <span
        className={cn(
          accent
            ? "truncate text-positive"
            : bold
              ? undefined
              : "text-ink-muted",
        )}
      >
        {label}
      </span>
      <span className={cn("tabular-nums", accent && "text-positive")}>
        {value}
      </span>
    </div>
  );
}
