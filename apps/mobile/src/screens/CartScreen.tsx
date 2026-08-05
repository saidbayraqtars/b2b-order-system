import { useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import type { PaymentMethod } from "@repo/types";
import { useCreateOrder, useOrderQuote } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/types";
import { cartTotals, useCart } from "@/store/cart";
import { Button, Card, Empty, Field } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

const METHODS: PaymentMethod[] = ["OPEN_ACCOUNT", "CREDIT_CARD"];

// Draft review + submit.
//
// The totals shown are the server's: campaigns are decided server-side, so a
// device that added up its own lines would quietly under-report every discount.
// The on-device figures are kept only as the placeholder while that request is
// in flight. POST /api/orders re-runs the same calculation inside its
// transaction, so what is quoted is what is charged.
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
  const [couponDraft, setCouponDraft] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);

  const items = lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
  const quote = useOrderQuote(
    { companyId, paymentMethod: method, couponCode: coupon ?? undefined, items },
    lines.length > 0,
  );
  const q = quote.data;

  function onSubmit() {
    setError(null);
    createOrder.mutate(
      {
        companyId,
        paymentMethod: method,
        ...(coupon ? { couponCode: coupon } : {}),
        items,
      },
      {
        onSuccess: (res) => {
          clear();
          setCoupon(null);
          setCouponDraft("");
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

        <View className="flex-row items-end gap-2">
          <Field
            label="Kupon kodu"
            className="flex-1"
            autoCapitalize="characters"
            placeholder="KUPON25"
            editable={coupon === null}
            value={couponDraft}
            onChangeText={(t) => setCouponDraft(t.toUpperCase())}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (coupon === null) {
                if (couponDraft.trim().length >= 3) setCoupon(couponDraft.trim());
              } else {
                setCoupon(null);
                setCouponDraft("");
              }
            }}
            className="h-12 items-center justify-center rounded-xl border border-neutral-300 px-4 dark:border-neutral-700"
          >
            <Text className="text-neutral-900 dark:text-neutral-100">
              {coupon === null ? "Uygula" : "Kaldır"}
            </Text>
          </Pressable>
        </View>

        {quote.isError ? (
          <Text className="text-red-600">
            {quote.error instanceof Error ? quote.error.message : "Fiyat alınamadı"}
          </Text>
        ) : null}

        <View className="flex-row justify-between">
          <Text className="text-neutral-500">Ara toplam</Text>
          <Text className="text-neutral-900 dark:text-neutral-100">
            {formatMoney(
              q ? Number(q.subtotal) - Number(q.discountTotal) : totals.subtotal,
            )}
          </Text>
        </View>
        {q?.promotions.map((p) => (
          <View key={p.promotionId} className="flex-row justify-between">
            <Text className="flex-1 text-emerald-700 dark:text-emerald-400">
              Kampanya: {p.name}
            </Text>
            <Text className="text-emerald-700 dark:text-emerald-400">
              − {formatMoney(p.amount)}
            </Text>
          </View>
        ))}
        <View className="flex-row justify-between">
          <Text className="text-neutral-500">KDV</Text>
          <Text className="text-neutral-900 dark:text-neutral-100">
            {formatMoney(q ? q.taxTotal : totals.taxTotal)}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
            Genel toplam
          </Text>
          <Text className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {formatMoney(q ? q.grandTotal : totals.grandTotal)}
          </Text>
        </View>
        {quote.isFetching ? (
          <Text className="text-xs text-neutral-400">Fiyat güncelleniyor…</Text>
        ) : null}

        {error ? <Text className="text-red-600">{error}</Text> : null}

        <Button
          title="Siparişi gönder"
          onPress={onSubmit}
          disabled={quote.isError || quote.isLoading}
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
