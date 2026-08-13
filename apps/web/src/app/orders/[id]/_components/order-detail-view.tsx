"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderDetail } from "@repo/services";
import {
  PAYMENT_METHOD_LABELS,
  type OrderStatus,
  type Role,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { CurrencyNote } from "@/components/currency-note";
import { Button, ErrorLine, Panel, TextInput } from "@/components/form";
import {
  Badge,
  type BadgeTone,
  Card,
  LoadingState,
  PageHeader,
  TBody,
  THead,
  Table,
  Td,
  Th,
} from "@/components/ui";
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

// Renkler elle yazılmış Tailwind sınıfıydı ve koyu temada hiçbiri
// tanımlanmamıştı: koyu zeminde açık amber üzerine koyu amber metin okunmuyordu.
// `Badge` tonları ikisini birden tanımlıyor. Ton sayısı sınıf sayısından az —
// PROCESSING ile SHIPPED ayrı iki mavi değil, ikisi de "işlemde".
const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  PENDING_CREDIT: "warning",
  CONFIRMED: "success",
  PROCESSING: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REJECTED: "danger",
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

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorLine error={query.error} />;

  const o = query.data!.order;
  const shipping = o.availableTransitions.includes("SHIPPED");

  return (
    <div className="space-y-6">
      <PageHeader
        title={o.orderNumber}
        subtitle={`${o.company.name} · ${dateTime(o.createdAt)} · ${o.createdByName}`}
        actions={
          <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
        }
      />

      <Card className="p-0">
        <Table>
          <THead>
            <tr>
              <Th>Ürün</Th>
              <Th>SKU</Th>
              <Th align="right">Adet</Th>
              <Th align="right">Birim</Th>
              <Th align="right">İskonto</Th>
              <Th align="right">Kampanya</Th>
              <Th align="right">Tutar</Th>
            </tr>
          </THead>
          <TBody>
            {o.items.map((i) => (
              <tr key={i.id}>
                <Td>
                  {i.productName}
                  {i.isGift && (
                    <span className="ml-2">
                      <Badge tone="success">hediye</Badge>
                    </span>
                  )}
                </Td>
                <Td muted>{i.sku}</Td>
                <Td align="right" numeric>
                  {i.quantity}
                </Td>
                <Td align="right" numeric>
                  {formatTRY(i.unitPrice)}
                  {/* Dövizle listelenmişse hangi sayıdan hangi kurla
                      çevrildiği: sipariş bir kez fiyatlanır ve o kur burada
                      donmuştur, bugünkü kurla yeniden hesaplanamaz. */}
                  <CurrencyNote
                    currency={i.listCurrency}
                    amount={i.listUnitPrice}
                    rate={i.exchangeRate}
                    className="block text-[11px] font-normal text-neutral-500"
                  />
                </Td>
                <Td align="right" numeric>
                  {Number(i.discount) > 0 ? formatTRY(i.discount) : "—"}
                </Td>
                <Td
                  align="right"
                  numeric
                  className="text-emerald-700 dark:text-emerald-400"
                >
                  {Number(i.promotionDiscount) > 0
                    ? `− ${formatTRY(i.promotionDiscount)}`
                    : "—"}
                </Td>
                <Td align="right" numeric>
                  {formatTRY(i.lineTotal)}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-1 text-sm">
          <Row label="Ara toplam" value={formatTRY(o.subtotal)} />
          <Row label="İskonto" value={formatTRY(o.discountTotal)} />
          {o.volumeTier && (
            // Part of "İskonto" above, not a further deduction — named because
            // a customer asking why the price moved deserves the reason.
            <Row
              label={`↳ Hacim: ${o.volumeTier.name} (%${o.volumeTier.percent})`}
              value="iskontoya dahil"
            />
          )}
          {o.promotions.map((p) => (
            <Row
              key={p.promotionId}
              label={`Kampanya: ${p.name}${p.code ? ` (${p.code})` : ""}`}
              value={`− ${formatTRY(p.amount)}`}
            />
          ))}
          {Number(o.shippingDiscount) > 0 && (
            <Row
              label="Nakliye indirimi"
              value={`− ${formatTRY(o.shippingDiscount)}`}
            />
          )}
          {Number(o.shippingFee) > 0 && (
            <Row label="Nakliye" value={formatTRY(o.shippingFee)} />
          )}
          <Row label="KDV" value={formatTRY(o.taxTotal)} />
          <Row label="Genel toplam" value={formatTRY(o.grandTotal)} strong />
          <Row label="Vade" value={`${o.paymentTermDays} gün`} />
          {/* One label map, next to the enum: this used to branch on
              OPEN_ACCOUNT and call everything else "Kredi kartı", so a çek
              order showed the wrong settlement. */}
          <Row label="Ödeme" value={PAYMENT_METHOD_LABELS[o.paymentMethod]} />
        </Card>

        <Card className="space-y-1 text-sm">
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
          {o.trackingNumber && (
            <Row label="Takip no" value={o.trackingNumber} />
          )}
          {o.note && (
            <p className="pt-2 text-neutral-500">
              <span className="font-medium">Not:</span> {o.note}
            </p>
          )}
        </Card>
      </section>

      <FulfilmentPanel
        orderId={orderId}
        role={role}
        canShip={o.status === "CONFIRMED" || o.status === "PROCESSING"}
      />

      {o.availableTransitions.length > 0 && (
        <Panel title="Durum güncelle">
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Not (opsiyonel)"
            className="mb-2"
          />

          {shipping && (
            <div className="mb-2 flex flex-wrap gap-2">
              <TextInput
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Kargo firması"
                className="flex-1"
              />
              <TextInput
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="Takip numarası"
                className="flex-1"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {o.availableTransitions.map((s) => (
              <Button
                key={s}
                // İptal kırmızı: geri alınamayan tek geçiş ve onay penceresi
                // tek başına yeterli değil — düğme de öyle görünmeli.
                variant={s === "CANCELLED" ? "danger" : "primary"}
                // Dönen simge yalnızca tıklanan düğmede: `isPending` tek başına
                // hepsini birden döndürüyordu ve hangisinin işlendiği
                // kaybolurdu. Ötekiler yine kilitli — `disabled`.
                loading={change.isPending && change.variables === s}
                disabled={change.isPending}
                onClick={() => {
                  if (
                    s !== "CANCELLED" ||
                    confirm(
                      `${o.orderNumber} iptal edilsin mi? Stoklar iade edilir, cari borç geri alınır.`,
                    )
                  ) {
                    change.mutate(s);
                  }
                }}
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
          </div>

          <ErrorLine error={change.error} />
        </Panel>
      )}

      <Panel title="Durum geçmişi">
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
      </Panel>
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
