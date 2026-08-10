import { useLayoutEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { hasPermission, PAYMENT_METHOD_LABELS, type OrderStatus } from "@repo/types";
import { useOrder, useOrderAction } from "@/lib/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Badge, Button, Card, ErrorState, Loading, Row } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

// The order, and what this caller may do with it.
//
// Which actions exist is not a device decision: the API already answers it per
// caller in `availableTransitions`, and approve/reject is gated by the
// `orders.approve` permission the session carries. The screen only renders what
// it was told — inventing buttons here would offer taps the server refuses, and
// hiding a legitimate one would send a buyer to a laptop for a single approval,
// which is exactly what made this screen read-only for too long.
export default function OrderDetailScreen({
  navigation,
  route,
}: ScreenProps<"OrderDetail">) {
  const { orderId, orderNumber } = route.params;
  const { data, isPending, error, refetch } = useOrder(orderId);
  const user = useAuthStore((s) => s.user);
  const { approve, reject, changeStatus } = useOrderAction(orderId);
  const [actionError, setActionError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: orderNumber });
  }, [navigation, orderNumber]);

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const o = data;
  const onError = (err: unknown) =>
    setActionError(err instanceof Error ? err.message : "İşlem tamamlanamadı");

  // Approval takes both halves the endpoint takes: the role decides who is even
  // in the approval chain (the buying company's admin, or the seller), the
  // permission decides whether this particular account was given the power.
  const canApprove =
    (user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN") &&
    hasPermission(user?.permissions, "orders.approve") &&
    (o.status === "PENDING_APPROVAL" || o.status === "PENDING_CREDIT");
  // Cancellation is a transition like any other; the server already filtered
  // the list down to what this caller may set.
  const canCancel = o.availableTransitions.includes("CANCELLED");
  // Fulfilment moves belong to whoever ships. Offered on the phone because a
  // warehouse tablet is the same client as a phone, and the API decides anyway.
  const fulfilment = o.availableTransitions.filter((s) =>
    (["PROCESSING", "SHIPPED", "DELIVERED"] as OrderStatus[]).includes(s),
  );

  function confirmAction(
    title: string,
    message: string,
    run: () => void,
    destructive = false,
  ) {
    Alert.alert(title, message, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: title,
        style: destructive ? "destructive" : "default",
        onPress: () => {
          setActionError(null);
          run();
        },
      },
    ]);
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      contentContainerClassName="gap-4 p-4 pb-10"
    >
      <Card>
        <View className="mb-2 flex-row items-start justify-between gap-3">
          <Text className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {o.orderNumber}
          </Text>
          <Badge label={ORDER_STATUS_LABEL[o.status]} tone="blue" />
        </View>
        <Text className="text-sm text-neutral-500">
          {o.company.name} · {formatDateTime(o.createdAt)}
        </Text>
        <Text className="text-sm text-neutral-500">Oluşturan: {o.createdByName}</Text>
        {o.carrier ? (
          <Text className="mt-1 text-sm text-neutral-500">
            Kargo: {o.carrier}
            {o.trackingNumber ? ` · ${o.trackingNumber}` : ""}
          </Text>
        ) : null}
      </Card>

      {canApprove || canCancel || fulfilment.length > 0 ? (
        <Card className="gap-2">
          <Text className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            İşlemler
          </Text>
          {canApprove ? (
            <>
              <Button
                title="Siparişi onayla"
                loading={approve.isPending}
                onPress={() =>
                  confirmAction(
                    "Onayla",
                    `${o.orderNumber} onaylansın mı?`,
                    () => approve.mutate(undefined, { onError }),
                  )
                }
              />
              <Button
                title="Siparişi reddet"
                variant="danger"
                loading={reject.isPending}
                onPress={() =>
                  confirmAction(
                    "Reddet",
                    `${o.orderNumber} reddedilsin mi? Ayrılan stok ve cari borç geri alınır.`,
                    () => reject.mutate(undefined, { onError }),
                    true,
                  )
                }
              />
            </>
          ) : null}
          {fulfilment.map((s) => (
            <Button
              key={s}
              title={`${ORDER_STATUS_LABEL[s]} olarak işaretle`}
              variant="secondary"
              loading={changeStatus.isPending}
              onPress={() =>
                confirmAction(
                  ORDER_STATUS_LABEL[s],
                  `${o.orderNumber} "${ORDER_STATUS_LABEL[s]}" durumuna alınsın mı?`,
                  () => changeStatus.mutate({ status: s }, { onError }),
                )
              }
            />
          ))}
          {canCancel ? (
            <Button
              title="Siparişi iptal et"
              variant="danger"
              loading={changeStatus.isPending}
              onPress={() =>
                confirmAction(
                  "İptal et",
                  `${o.orderNumber} iptal edilsin mi? Stok ve cari borç geri alınır.`,
                  () =>
                    changeStatus.mutate({ status: "CANCELLED" }, { onError }),
                  true,
                )
              }
            />
          ) : null}
          {actionError ? (
            <Text className="text-red-600">{actionError}</Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Kalemler ({o.items.length})
        </Text>
        {o.items.map((i) => (
          <View
            key={i.id}
            className="border-t border-neutral-100 py-2 dark:border-neutral-800"
          >
            <Text className="text-neutral-900 dark:text-neutral-100">
              {i.productName}
            </Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-neutral-500">
                {i.sku} · {formatMoney(i.unitPrice)} × {i.quantity}
              </Text>
              <Text className="font-medium text-neutral-900 dark:text-neutral-100">
                {formatMoney(i.lineTotal)}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Row label="Ara toplam" value={formatMoney(o.subtotal, o.currency)} />
        <Row label="İskonto" value={formatMoney(o.discountTotal, o.currency)} />
        {o.volumeTier ? (
          // Already part of "İskonto" above — shown so the customer can see why
          // the price moved, not as a further deduction.
          <Row
            label={`↳ Hacim: ${o.volumeTier.name}`}
            value={`%${o.volumeTier.percent} · dahil`}
          />
        ) : null}
        <Row label="KDV" value={formatMoney(o.taxTotal, o.currency)} />
        <Row
          label="Genel toplam"
          value={formatMoney(o.grandTotal, o.currency)}
          strong
        />
        <Row label="Ödeme" value={PAYMENT_METHOD_LABELS[o.paymentMethod]} />
        <Row
          label="Vade"
          value={o.paymentTermDays > 0 ? `${o.paymentTermDays} gün` : "Peşin"}
        />
      </Card>

      {o.shippingAddress ? (
        <Card>
          <Text className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Sevkiyat adresi
          </Text>
          <Text className="text-neutral-500">
            {o.shippingAddress.label} · {o.shippingAddress.line1}
            {"\n"}
            {o.shippingAddress.district ? `${o.shippingAddress.district}, ` : ""}
            {o.shippingAddress.city}
          </Text>
        </Card>
      ) : null}

      <Card>
        <Text className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Durum geçmişi
        </Text>
        {o.history.map((h) => (
          <View key={h.id} className="py-1">
            <Text className="text-neutral-900 dark:text-neutral-100">
              {h.fromStatus
                ? `${ORDER_STATUS_LABEL[h.fromStatus]} → ${ORDER_STATUS_LABEL[h.toStatus]}`
                : `Oluşturuldu (${ORDER_STATUS_LABEL[h.toStatus]})`}
            </Text>
            <Text className="text-xs text-neutral-500">
              {formatDateTime(h.createdAt)} · {h.changedByName}
            </Text>
            {h.note ? (
              <Text className="text-sm text-neutral-500">{h.note}</Text>
            ) : null}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
