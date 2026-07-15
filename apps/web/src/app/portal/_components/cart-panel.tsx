"use client";

import { useMutation } from "@tanstack/react-query";
import type { CreateOrderResult } from "@repo/services";
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
  const totals = cartTotals(lines);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<CreateOrderResult>("/api/orders", {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      }),
    onSuccess: () => clear(),
  });

  const result = mutation.data;

  return (
    <aside className="sticky top-4 flex h-fit flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold">Sepet</h2>

      {result && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <p className="font-medium">Sipariş #{result.orderNumber}</p>
          <p>{STATUS_MESSAGE[result.status] ?? result.status}</p>
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
        <div className="flex flex-col gap-1 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
          <Row label="Ara toplam" value={formatTRY(totals.subtotal)} />
          <Row label="KDV" value={formatTRY(totals.taxTotal)} />
          <Row label="Genel toplam" value={formatTRY(totals.grandTotal)} bold />
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="mt-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
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
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-neutral-500"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
