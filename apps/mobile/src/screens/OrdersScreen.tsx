import { FlatList, Pressable, Text, View } from "react-native";
import type { OrderStatus } from "@repo/types";
import { useOrders } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import { Badge, Card, Empty, ErrorState, Loading } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

const TONE: Record<OrderStatus, "neutral" | "green" | "amber" | "red" | "blue"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "amber",
  PENDING_CREDIT: "amber",
  CONFIRMED: "green",
  PROCESSING: "blue",
  SHIPPED: "blue",
  DELIVERED: "green",
  CANCELLED: "neutral",
  REJECTED: "red",
};

export default function OrdersScreen({
  navigation,
  route,
}: ScreenProps<"Orders">) {
  const companyId = route.params?.companyId;
  const { data, isPending, error, refetch, isRefetching } = useOrders(companyId);

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <FlatList
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      data={data}
      keyExtractor={(o) => o.id}
      contentContainerClassName="gap-3 p-4 pb-8"
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      ListEmptyComponent={<Empty text="Sipariş bulunamadı." />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate("OrderDetail", {
              orderId: item.id,
              orderNumber: item.orderNumber,
            })
          }
        >
          <Card>
            <View className="mb-2 flex-row items-start justify-between gap-3">
              <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
                {item.orderNumber}
              </Text>
              <Badge
                label={ORDER_STATUS_LABEL[item.status]}
                tone={TONE[item.status]}
              />
            </View>
            {!companyId ? (
              <Text className="text-sm text-neutral-500">{item.company.name}</Text>
            ) : null}
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-sm text-neutral-500">
                {formatDate(item.createdAt)} · {item._count.items} kalem
              </Text>
              <Text className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                {formatMoney(item.grandTotal)}
              </Text>
            </View>
          </Card>
        </Pressable>
      )}
    />
  );
}
