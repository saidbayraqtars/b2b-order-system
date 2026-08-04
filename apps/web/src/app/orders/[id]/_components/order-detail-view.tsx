"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderDetail } from "@repo/services";
import type { OrderStatus, Role } from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { FulfilmentPanel } from "./fulfilment-panel";

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay bekliyor",
  PENDING_CREDIT: "Kredi onayı bekliyor",
  CONFIRMED: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal",
  REJECTED: "Reddedildi",
};

const STATUS_CLASS: Record<OrderStatus, string> = {
  DRAFT: "bg-neutral-100 text-neutral-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  PENDING_CREDIT: "bg-orange-100 text-orange-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  SHIPPED: "bg-indigo-100 text-indigo-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-neutral-200 text-neutral-600",
  REJECTED: "bg-red-100 text-red-800",
};

function dateTime(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderDetailView({
  orderId,
  role,
}: {
  orderId: string;
  role: Role;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");

  const query = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => apiGet<{ order: OrderDetail }>(`/api/orders/${orderId}`),
  });

  const change = useMutation({
    mutationFn: (status: OrderStatus) =>
      apiPost(`/api/orders/${orderId}/status`, {
        status,
        note: note.trim() || undefined,
        // Carrier details only mean anything on the shipping transition.
        ...(status === "SHIPPED"
          ? {
              carrier: carrier.trim() || undefined,
              trackingNumber: tracking.trim() || undefined,
            }
          : {}),
      }),
    onSuccess: () => {
      setNote("");
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-neutral-500">Yükleniyor…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-600">{(query.error as Error).message}</p>;
  }

  const o = query.data!.order;
  const shipping = o.availableTransitions.includes("SHIPPED");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{o.orderNumber}</h1>
          <p className="text-sm text-neutral-500">
            {o.company.name} · {dateTime(o.createdAt)} · {o.createdByName}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm ${STATUS_CLASS[o.status]}`}
        >
          {STATUS_LABEL[o.status]}
        </span>
      </header>

      <section className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">Ürün</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2 text-right">Adet</th>
              <th className="px-3 py-2 text-right">Birim</th>
              <th className="px-3 py-2 text-right">İskonto</th>
              <th className="px-3 py-2 text-right">Kampanya</th>
              <th className="px-3 py-2 text-right">Tutar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {o.items.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2">{i.productName}</td>
                <td className="px-3 py-2 text-neutral-500">{i.sku}</td>
                <td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatTRY(i.unitPrice)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number(i.discount) > 0 ? formatTRY(i.discount) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                  {Number(i.promotionDiscount) > 0
                    ? `− ${formatTRY(i.promotionDiscount)}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatTRY(i.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <Row label="Ara toplam" value={formatTRY(o.subtotal)} />
          <Row label="İskonto" value={formatTRY(o.discountTotal)} />
          {o.promotions.map((p) => (
            <Row
              key={p.promotionId}
              label={`Kampanya: ${p.name}${p.code ? ` (${p.code})` : ""}`}
              value={`− ${formatTRY(p.amount)}`}
            />
          ))}
          {Number(o.shippingFee) > 0 && (
            <Row label="Nakliye" value={formatTRY(o.shippingFee)} />
          )}
          <Row label="KDV" value={formatTRY(o.taxTotal)} />
          <Row label="Genel toplam" value={formatTRY(o.grandTotal)} strong />
          <Row label="Vade" value={`${o.paymentTermDays} gün`} />
          <Row
            label="Ödeme"
            value={o.paymentMethod === "OPEN_ACCOUNT" ? "Açık hesap" : "Kredi kartı"}
          />
        </div>

        <div className="space-y-1 text-sm">
          {o.shippingAddress ? (
            <>
              <p className="font-medium">{o.shippingAddress.label}</p>
              <p className="text-neutral-500">
                {o.shippingAddress.line1}
                <br />
                {o.shippingAddress.district
                  ? `${o.shippingAddress.district}, `
                  : ""}
                {o.shippingAddress.city}
              </p>
            </>
          ) : (
            <p className="text-neutral-500">Sevkiyat adresi seçilmemiş.</p>
          )}
          {o.carrier && <Row label="Kargo" value={o.carrier} />}
          {o.trackingNumber && <Row label="Takip no" value={o.trackingNumber} />}
          {o.note && (
            <p className="pt-2 text-neutral-500">
              <span className="font-medium">Not:</span> {o.note}
            </p>
          )}
        </div>
      </section>

      <FulfilmentPanel
        orderId={orderId}
        role={role}
        canShip={o.status === "CONFIRMED" || o.status === "PROCESSING"}
      />

      {o.availableTransitions.length > 0 && (
        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-semibold">Durum güncelle</h2>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Not (opsiyonel)"
            className="mb-2 h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />

          {shipping && (
            <div className="mb-2 flex flex-wrap gap-2">
              <input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Kargo firması"
                className="h-9 flex-1 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="Takip numarası"
                className="h-9 flex-1 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {o.availableTransitions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={change.isPending}
                onClick={() => {
                  if (s !== "CANCELLED" || confirm(`${o.orderNumber} iptal edilsin mi? Stoklar iade edilir, cari borç geri alınır.`)) {
                    change.mutate(s);
                  }
                }}
                className={`h-9 rounded-md px-3 text-sm font-medium text-white disabled:opacity-50 ${
                  s === "CANCELLED"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {change.isError && (
            <p className="mt-2 text-sm text-red-600">
              {(change.error as Error).message}
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Durum geçmişi</h2>
        <ol className="space-y-2 border-l border-neutral-200 pl-4 dark:border-neutral-800">
          {o.history.map((h) => (
            <li key={h.id} className="text-sm">
              <span className="text-neutral-500">{dateTime(h.createdAt)}</span>{" "}
              <span className="font-medium">
                {h.fromStatus
                  ? `${STATUS_LABEL[h.fromStatus]} → ${STATUS_LABEL[h.toStatus]}`
                  : `Oluşturuldu (${STATUS_LABEL[h.toStatus]})`}
              </span>{" "}
              <span className="text-neutral-500">· {h.changedByName}</span>
              {h.note && <p className="text-neutral-500">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className={strong ? "font-bold tabular-nums" : "tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
