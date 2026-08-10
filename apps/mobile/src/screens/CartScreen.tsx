import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import type { PaymentMethod } from "@repo/types";
import {
  useCart,
  useClearCart,
  useCreateOrder,
  useOrderQuote,
  usePaymentOptions,
  useUpsertCartItem,
} from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { normalizeQty } from "@/lib/quantity";
import { Button, Card, Empty, ErrorState, Field, Loading } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

// Draft review + submit.
//
// Both the lines and the totals are the server's now. The lines because the
// cart moved off the device (a basket built on the phone has to be there on the
// laptop); the totals because campaigns are decided server-side, so a device
// adding up its own lines would quietly under-report every discount. POST
// /api/orders re-runs the same calculation inside its transaction, so what is
// quoted is what is charged.
export default function CartScreen({ navigation, route }: ScreenProps<"Cart">) {
  const { companyId } = route.params;
  const cart = useCart(companyId);
  const upsert = useUpsertCartItem();
  const clearCart = useClearCart();
  const createOrder = useCreateOrder();

  const [method, setMethod] = useState<PaymentMethod>("OPEN_ACCOUNT");
  const [termId, setTermId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [couponDraft, setCouponDraft] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);

  const lines = useMemo(() => cart.data?.lines ?? [], [cart.data]);

  // Which settlements this customer may pick. Asked rather than assumed: the
  // menu is per-company, and offering one the server will refuse only produces
  // a 422 the buyer cannot act on.
  const options = usePaymentOptions(companyId);
  // Memoised because both lists are effect dependencies below — a fresh array
  // on every render would re-run those effects forever.
  const methods = useMemo(() => options.data?.methods ?? [], [options.data]);
  const chosenMethod = methods.find((m) => m.value === method);

  // A vade only means something on a method that books debt; on a peşin one the
  // server rejects it outright, so it is not offered there either.
  const termsOffered = useMemo(
    () => (chosenMethod?.createsReceivable ? (options.data?.terms ?? []) : []),
    [chosenMethod, options.data],
  );

  // The default (açık hesap) is not always on the menu. Fall back to whatever
  // the customer actually has rather than leaving a selection they cannot use.
  useEffect(() => {
    const first = methods[0];
    if (first && !chosenMethod) setMethod(first.value);
  }, [methods, chosenMethod]);

  // Switching to a peşin method has to drop the vade with it.
  useEffect(() => {
    if (termId && !termsOffered.some((t) => t.id === termId)) setTermId(null);
  }, [termId, termsOffered]);

  const items = useMemo(
    () => lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    [lines],
  );
  // A line the company has no price for cannot be ordered; quoting with it in
  // would fail as NO_PRICE and name a product the buyer cannot fix from here.
  const unpriced = lines.filter((l) => l.netUnitPrice == null);

  const quote = useOrderQuote(
    {
      companyId,
      paymentMethod: method,
      paymentTermId: termId ?? undefined,
      couponCode: coupon ?? undefined,
      items,
    },
    lines.length > 0 && unpriced.length === 0 && !!chosenMethod,
  );
  const q = quote.data;

  function setQty(variantId: string, quantity: number) {
    upsert.mutate({ companyId, variantId, quantity });
  }

  function onSubmit() {
    setError(null);
    createOrder.mutate(
      {
        companyId,
        paymentMethod: method,
        ...(termId ? { paymentTermId: termId } : {}),
        ...(coupon ? { couponCode: coupon } : {}),
        items,
      },
      {
        onSuccess: (res) => {
          setCoupon(null);
          setCouponDraft("");
          Alert.alert(
            "Sipariş oluşturuldu",
            `${res.orderNumber} · ${formatMoney(res.grandTotal)}`,
            [
              {
                text: "Tamam",
                onPress: () => navigation.navigate("Orders", route.params),
              },
            ],
          );
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Sipariş oluşturulamadı"),
      },
    );
  }

  if (cart.isPending) return <Loading />;
  if (cart.error) {
    return <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />;
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
          const unit = item.netUnitPrice != null ? Number(item.netUnitPrice) : null;
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
                    {unit != null
                      ? `${formatMoney(unit)} × ${item.quantity} adet`
                      : "Bu firmaya fiyat tanımlı değil"}
                  </Text>
                </View>
                <Text className="font-bold text-neutral-900 dark:text-neutral-100">
                  {unit != null ? formatMoney(unit * item.quantity) : "—"}
                </Text>
              </View>

              <View className="mt-3 flex-row items-center gap-2">
                <Stepper
                  label="−"
                  onPress={() =>
                    setQty(
                      item.variantId,
                      normalizeQty(item, item.quantity - item.unitsPerCase),
                    )
                  }
                />
                <Text className="w-16 text-center text-neutral-900 dark:text-neutral-100">
                  {item.quantity}
                </Text>
                <Stepper
                  label="+"
                  onPress={() =>
                    setQty(
                      item.variantId,
                      normalizeQty(item, item.quantity + item.unitsPerCase),
                    )
                  }
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setQty(item.variantId, 0)}
                  className="ml-auto"
                >
                  <Text className="text-red-600">Kaldır</Text>
                </Pressable>
              </View>
              <Text className="mt-1 text-xs text-neutral-400">
                Koli {item.unitsPerCase} adet · min {item.moqUnits} · stok{" "}
                {item.stock}
              </Text>
            </Card>
          );
        }}
      />

      <View className="gap-3 border-t border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        {unpriced.length > 0 ? (
          <Text className="text-amber-600">
            {unpriced.length} kalemin bu firmaya fiyatı yok — çıkarmadan sipariş
            verilemez.
          </Text>
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          {methods.map((m) => (
            <Chip
              key={m.value}
              label={m.label}
              selected={m.value === method}
              onPress={() => setMethod(m.value)}
            />
          ))}
        </View>

        {termsOffered.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            <Chip
              label={`Varsayılan (${options.data?.defaultTermDays ?? 0} gün)`}
              selected={termId === null}
              onPress={() => setTermId(null)}
            />
            {termsOffered.map((t) => (
              <Chip
                key={t.id}
                label={t.name}
                selected={t.id === termId}
                onPress={() => setTermId(t.id)}
              />
            ))}
          </View>
        ) : null}

        {/* What the chosen settlement actually does, before the order is sent. */}
        {q ? (
          <Text className="text-xs text-neutral-500">
            {q.createsReceivable
              ? `Cari hesaba işlenir · ${q.paymentTermDays} gün vade`
              : "Sipariş anında ödenir — cari hesaba işlenmez"}
          </Text>
        ) : null}

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
            {q ? formatMoney(Number(q.subtotal) - Number(q.discountTotal)) : "—"}
          </Text>
        </View>
        {q?.volumeDiscount ? (
          // Named, not deducted: the ara toplam above is already net of it.
          <Text className="text-xs text-emerald-700 dark:text-emerald-400">
            Hacim iskontosu — {q.volumeDiscount.tierName} (%
            {q.volumeDiscount.percent}), ara toplama dahil: −
            {formatMoney(q.volumeDiscount.amount)}
          </Text>
        ) : null}
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
            {q ? formatMoney(q.taxTotal) : "—"}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
            Genel toplam
          </Text>
          <Text className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {q ? formatMoney(q.grandTotal) : "—"}
          </Text>
        </View>
        {quote.isFetching ? (
          <Text className="text-xs text-neutral-400">Fiyat güncelleniyor…</Text>
        ) : null}

        {error ? <Text className="text-red-600">{error}</Text> : null}

        <Button
          title="Siparişi gönder"
          onPress={onSubmit}
          disabled={!q || quote.isError || quote.isFetching || unpriced.length > 0}
          loading={createOrder.isPending}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert("Sepeti boşalt", "Tüm kalemler silinsin mi?", [
              { text: "Vazgeç", style: "cancel" },
              {
                text: "Boşalt",
                style: "destructive",
                onPress: () => clearCart.mutate(companyId),
              },
            ])
          }
          className="items-center py-1"
        >
          <Text className="text-sm text-neutral-500">Sepeti boşalt</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-xl border px-3 py-2 ${
        selected
          ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950"
          : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      <Text
        className={`text-sm ${
          selected
            ? "font-semibold text-indigo-700 dark:text-indigo-300"
            : "text-neutral-700 dark:text-neutral-300"
        }`}
      >
        {label}
      </Text>
    </Pressable>
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
