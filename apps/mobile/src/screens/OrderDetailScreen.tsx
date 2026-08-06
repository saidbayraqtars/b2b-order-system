import { useLayoutEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { PAYMENT_METHOD_LABELS } from "@repo/types";
import { useOrder } from "@/lib/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import { Badge, Card, ErrorState, Loading, Row } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

// Read-only on mobile: status changes are a back-office action, so the app shows
// where the order stands rather than offering transitions the API would refuse.
export default function OrderDetailScreen({
  navigation,
  route,
}: ScreenProps<"OrderDetail">) {
  const { orderId, orderNumber } = route.params;
  const { data, isPending, error, refetch } = useOrder(orderId);

  useLayoutEffect(() => {
    navigation.setOptions({ title: orderNumber });
  }, [navigation, orderNumber]);

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const o = data;

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
