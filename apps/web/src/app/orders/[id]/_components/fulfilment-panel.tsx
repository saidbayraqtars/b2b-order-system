"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InvoiceView, OpenLine, ShipmentView } from "@repo/services";
import type { Role } from "@repo/types";
import { apiDelete, apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";

// Despatch and invoice, side by side, because in practice they are decided
// together: what left the warehouse, and what has been billed for it.
//
// Everyone who may see the order sees the documents; only a super admin gets the
// forms, which mirrors where the service layer draws the line.

interface Props {
  orderId: string;
  role: Role;
  /** Nothing can be despatched from a cancelled or unconfirmed order. */
  canShip: boolean;
}

export function FulfilmentPanel({ orderId, role, canShip }: Props) {
  const qc = useQueryClient();
  const isAdmin = role === "SUPER_ADMIN";

  const shipments = useQuery({
    queryKey: ["order-shipments", orderId],
    queryFn: () =>
      apiGet<{ shipments: ShipmentView[]; openLines: OpenLine[] }>(
        `/api/orders/${orderId}/shipments`,
      ),
  });
  const invoices = useQuery({
    queryKey: ["order-invoices", orderId],
    queryFn: () =>
      apiGet<{ invoices: InvoiceView[] }>(`/api/orders/${orderId}/invoices`),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["order-shipments", orderId] });
    void qc.invalidateQueries({ queryKey: ["order-invoices", orderId] });
    void qc.invalidateQueries({ queryKey: ["order", orderId] });
  };

  const openLines = shipments.data?.openLines ?? [];
  const anythingToShip = openLines.some((l) => l.remainingToShip > 0);
  const anythingToInvoice = openLines.some((l) => l.remainingToInvoice > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="İrsaliyeler">
        <ErrorLine error={shipments.error} />
        {shipments.isLoading && (
          <p className="text-sm text-neutral-500">Yükleniyor…</p>
        )}

        {shipments.data && shipments.data.shipments.length === 0 && (
          <p className="text-sm text-neutral-500">Henüz sevkiyat yapılmadı.</p>
        )}

        <ul className="space-y-2">
          {(shipments.data?.shipments ?? []).map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/documents/shipments/${s.id}`}
                    className="font-medium underline"
                  >
                    {s.documentNumber}
                  </Link>
                  <p className="text-neutral-500">
                    {new Date(s.shippedAt).toLocaleDateString("tr-TR")} ·{" "}
                    {s.items.reduce((n, i) => n + i.quantity, 0)} adet
                    {s.carrier ? ` · ${s.carrier}` : ""}
                    {s.invoiceNumber ? ` · fatura ${s.invoiceNumber}` : " · faturasız"}
                  </p>
                </div>
                {isAdmin && !s.invoiceId && (
                  <CancelShipmentButton id={s.id} onDone={refresh} />
                )}
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
                {s.items.map((i) => (
                  <li key={i.orderItemId}>
                    {i.productName} — {i.quantity} adet
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        {isAdmin && canShip && anythingToShip && (
          <ShipmentForm
            orderId={orderId}
            lines={openLines.filter((l) => l.remainingToShip > 0)}
            onDone={refresh}
          />
        )}
      </Panel>

      <Panel title="Faturalar">
        <ErrorLine error={invoices.error} />
        {invoices.isLoading && (
          <p className="text-sm text-neutral-500">Yükleniyor…</p>
        )}

        {invoices.data && invoices.data.invoices.length === 0 && (
          <p className="text-sm text-neutral-500">Henüz fatura kesilmedi.</p>
        )}

        <ul className="space-y-2">
          {(invoices.data?.invoices ?? []).map((inv) => (
            <li
              key={inv.id}
              className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/documents/invoices/${inv.id}`}
                    className="font-medium underline"
                  >
                    {inv.documentNumber}
                  </Link>
                  {inv.status === "CANCELLED" && (
                    <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                      iptal
                    </span>
                  )}
                  <p className="text-neutral-500">
                    {new Date(inv.issuedAt).toLocaleDateString("tr-TR")} · vade{" "}
                    {new Date(inv.dueDate).toLocaleDateString("tr-TR")} ·{" "}
                    {formatTRY(inv.grandTotal)}
                  </p>
                </div>
                {isAdmin && inv.status === "ISSUED" && (
                  <CancelInvoiceButton id={inv.id} onDone={refresh} />
                )}
              </div>
            </li>
          ))}
        </ul>

        {isAdmin && anythingToInvoice && (
          <InvoiceForm
            orderId={orderId}
            uninvoicedShipments={(shipments.data?.shipments ?? []).filter(
              (s) => !s.invoiceId,
            )}
            onDone={refresh}
          />
        )}
      </Panel>
    </div>
  );
}

function ShipmentForm({
  orderId,
  lines,
  onDone,
}: {
  orderId: string;
  lines: OpenLine[];
  onDone: () => void;
}) {
  // Pre-filled with everything outstanding: shipping the whole remainder is the
  // common case, and trimming a number is quicker than typing every one.
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.orderItemId, String(l.remainingToShip)])),
  );
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [externalNumber, setExternalNumber] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiPost(`/api/orders/${orderId}/shipments`, {
        items: lines
          .map((l) => ({
            orderItemId: l.orderItemId,
            quantity: Number(quantities[l.orderItemId] ?? 0),
          }))
          .filter((i) => i.quantity > 0),
        carrier: carrier.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        externalNumber: externalNumber.trim() || undefined,
      }),
    onSuccess: onDone,
  });

  const total = lines.reduce(
    (n, l) => n + (Number(quantities[l.orderItemId]) || 0),
    0,
  );

  return (
    <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <h3 className="mb-2 text-sm font-semibold">Yeni irsaliye</h3>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.orderItemId} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm">
              {l.productName}
              <span className="ml-1 text-xs text-neutral-500">
                (kalan {l.remainingToShip})
              </span>
            </span>
            <TextInput
              type="number"
              min={0}
              max={l.remainingToShip}
              className="w-24"
              value={quantities[l.orderItemId] ?? ""}
              onChange={(e) =>
                setQuantities((q) => ({ ...q, [l.orderItemId]: e.target.value }))
              }
            />
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label>
          <Label>Taşıyıcı</Label>
          <TextInput
            className="w-40"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
          />
        </label>
        <label>
          <Label>Takip no</Label>
          <TextInput
            className="w-40"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
        </label>
        <label>
          <Label hint="ERP serisi kullanılıyorsa">Belge no</Label>
          <TextInput
            className="w-40"
            value={externalNumber}
            onChange={(e) => setExternalNumber(e.target.value)}
          />
        </label>
        <Button disabled={total === 0 || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Kaydediliyor…" : `Sevk et (${total} adet)`}
        </Button>
      </div>
      <ErrorLine error={create.error} />
    </div>
  );
}

function InvoiceForm({
  orderId,
  uninvoicedShipments,
  onDone,
}: {
  orderId: string;
  uninvoicedShipments: ShipmentView[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [externalNumber, setExternalNumber] = useState("");
  const [dueDate, setDueDate] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiPost(`/api/orders/${orderId}/invoices`, {
        shipmentIds: selected.length ? selected : undefined,
        externalNumber: externalNumber.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      setSelected([]);
      onDone();
    },
  });

  return (
    <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <h3 className="mb-2 text-sm font-semibold">Yeni fatura</h3>

      {uninvoicedShipments.length > 0 ? (
        <>
          <p className="mb-1 text-xs text-neutral-500">
            İrsaliye seçin — hiçbiri seçilmezse siparişin faturalanmamış tüm
            kalemleri faturalanır.
          </p>
          <ul className="mb-2 space-y-1 text-sm">
            {uninvoicedShipments.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={(e) =>
                      setSelected((cur) =>
                        e.target.checked
                          ? [...cur, s.id]
                          : cur.filter((id) => id !== s.id),
                      )
                    }
                  />
                  {s.documentNumber} ·{" "}
                  {s.items.reduce((n, i) => n + i.quantity, 0)} adet
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-2 text-xs text-neutral-500">
          Faturalanmamış irsaliye yok — siparişin kalan kalemleri faturalanacak.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label>
          <Label hint="boşsa vadeden hesaplanır">Vade tarihi</Label>
          <TextInput
            type="date"
            className="w-44"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <label>
          <Label hint="ERP serisi kullanılıyorsa">Belge no</Label>
          <TextInput
            className="w-40"
            value={externalNumber}
            onChange={(e) => setExternalNumber(e.target.value)}
          />
        </label>
        <Button disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Kesiliyor…" : "Fatura kes"}
        </Button>
      </div>
      <ErrorLine error={create.error} />
    </div>
  );
}

function CancelShipmentButton({ id, onDone }: { id: string; onDone: () => void }) {
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/shipments/${id}`),
    onSuccess: onDone,
  });
  return (
    <>
      <Button
        variant="danger"
        disabled={remove.isPending}
        onClick={() => {
          if (confirm("İrsaliye iptal edilsin mi? Numara geri alınmaz.")) {
            remove.mutate();
          }
        }}
      >
        İptal
      </Button>
      <ErrorLine error={remove.error} />
    </>
  );
}

function CancelInvoiceButton({ id, onDone }: { id: string; onDone: () => void }) {
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/invoices/${id}`),
    onSuccess: onDone,
  });
  return (
    <>
      <Button
        variant="danger"
        disabled={remove.isPending}
        onClick={() => {
          if (confirm("Fatura iptal edilsin mi? Numara geri alınmaz.")) {
            remove.mutate();
          }
        }}
      >
        İptal
      </Button>
      <ErrorLine error={remove.error} />
    </>
  );
}
