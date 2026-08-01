import { useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import type { PaymentMethod } from "@repo/types";
import { useCreateOrder } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/types";
import { cartTotals, useCart } from "@/store/cart";
import { Button, Card, Empty } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

const METHODS: PaymentMethod[] = ["OPEN_ACCOUNT", "CREDIT_CARD"];

// Draft review + submit. Totals here are an on-device preview; the server
// recalculates prices, MOQ/case rules, stock and credit on POST /api/orders,
// so a mismatch surfaces as a typed BusinessError rather than a silent accept.
export default function CartScreen({ navigation, route }: ScreenProps<"Cart">) {
  const { companyId } = route.params;
  const lines = useCart((s) => s.lines);
  const inc = useCart((s) => s.inc);
  const dec = useCart((s) => s.dec);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const totals = cartTotals(lines);

  const createOrder = useCreateOrder();
  const [method, setMethod] = useState<PaymentMethod>("OPEN_ACCOUNT");
  const [error, setError] = useState<string | null>(null);

  function onSubmit() {
    setError(null);
    createOrder.mutate(
      {
        companyId,
        paymentMethod: method,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      },
      {
        onSuccess: (res) => {
          clear();
          Alert.alert(
            "Sipariş oluşturuldu",
            `${res.orderNumber} · ${formatMoney(res.grandTotal)}`,
            [{ text: "Tamam", onPress: () => navigation.navigate("Orders", route.params) }],
          );
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Sipariş oluşturulamadı"),
      },
    );
  }

  if (!lines.length) return <Empty text="Sepet boş." />;

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-neutral-950">
      <FlatList
        data={lines}
        keyExtractor={(l) => l.variantId}
        contentContainerClassName="gap-3 p-4"
        renderItem={({ item }) => {
          const attrs = [item.color, item.size].filter(Boolean).join(" / ");
          return (
            <Card>
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {item.productName}
                  </Text>
                  <Text className="text-xs text-neutral-500">
                    {attrs ? `${attrs} · ` : ""}
                    {item.sku}
                  </Text>
                  <Text className="mt-1 text-sm text-neutral-500">
                    {formatMoney(item.netUnitPrice)} × {item.quantity} adet
                  </Text>
                </View>
                <Text className="font-bold text-neutral-900 dark:text-neutral-100">
                  {formatMoney(item.netUnitPrice * item.quantity)}
                </Text>
              </View>

              <View className="mt-3 flex-row items-center gap-2">
                <Stepper label="−" onPress={() => dec(item.variantId)} />
                <Text className="w-16 text-center text-neutral-900 dark:text-neutral-100">
                  {item.quantity}
                </Text>
                <Stepper label="+" onPress={() => inc(item.variantId)} />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => remove(item.variantId)}
                  className="ml-auto"
                >
                  <Text className="text-red-600">Kaldır</Text>
                </Pressable>
              </View>
              <Text className="mt-1 text-xs text-neutral-400">
                Koli {item.unitsPerCase} adet · min {item.moqUnits}
              </Text>
            </Card>
          );
        }}
      />

      <View className="gap-3 border-t border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row gap-2">
          {METHODS.map((m) => {
            const on = m === method;
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setMethod(m)}
                className={`flex-1 items-center rounded-xl border px-2 py-2 ${
                  on
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
              >
                <Text
                  className={`text-sm ${
                    on
                      ? "font-semibold text-indigo-700 dark:text-indigo-300"
                      : "text-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  {PAYMENT_METHOD_LABEL[m]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-row justify-between">
          <Text className="text-neutral-500">Ara toplam</Text>
          <Text className="text-neutral-900 dark:text-neutral-100">
            {formatMoney(totals.subtotal)}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-neutral-500">KDV</Text>
          <Text className="text-neutral-900 dark:text-neutral-100">
            {formatMoney(totals.taxTotal)}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
            Genel toplam
          </Text>
          <Text className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {formatMoney(totals.grandTotal)}
          </Text>
        </View>

        {error ? <Text className="text-red-600">{error}</Text> : null}

        <Button
          title="Siparişi gönder"
          onPress={onSubmit}
          loading={createOrder.isPending}
        />
      </View>
    </View>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-10 w-10 items-center justify-center rounded-xl border border-neutral-300 dark:border-neutral-700"
    >
      <Text className="text-lg text-neutral-900 dark:text-neutral-100">{label}</Text>
    </Pressable>
  );
}
