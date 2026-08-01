import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PaymentMethod } from "@repo/types";
import { useCompanies, useRecordPayment } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/types";
import { Button, Card, Field, Row } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

const METHODS: PaymentMethod[] = ["OPEN_ACCOUNT", "CREDIT_CARD"];

// Field collection (tahsilat). Posts a CREDIT ledger entry; the API returns the
// recomputed balance so the rep sees the effect without a refetch race.
export default function PaymentScreen({ navigation, route }: ScreenProps<"Payment">) {
  const { companyId } = route.params;
  const { data } = useCompanies();
  const company = data?.find((c) => c.id === companyId);
  const recordPayment = useRecordPayment();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("OPEN_ACCOUNT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Turkish keypads emit a comma; the API wants a JSON number.
  const parsed = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;

  function onSubmit() {
    setError(null);
    recordPayment.mutate(
      {
        companyId,
        amount: parsed,
        paymentMethod: method,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => navigation.goBack(),
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Tahsilat kaydedilemedi"),
      },
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      contentContainerClassName="gap-4 p-4"
      keyboardShouldPersistTaps="handled"
    >
      {company ? (
        <Card>
          <Text className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">
            {company.name}
          </Text>
          <Row
            label="Güncel bakiye"
            value={formatMoney(company.currentBalance, company.currency)}
            strong
          />
        </Card>
      ) : null}

      <Card className="gap-4">
        <Field
          label="Tahsilat tutarı"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0,00"
        />

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Ödeme yöntemi
          </Text>
          <View className="flex-row gap-2">
            {METHODS.map((m) => {
              const on = m === method;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setMethod(m)}
                  className={`flex-1 items-center rounded-xl border px-3 py-3 ${
                    on
                      ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950"
                      : "border-neutral-300 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={
                      on
                        ? "font-semibold text-indigo-700 dark:text-indigo-300"
                        : "text-neutral-700 dark:text-neutral-300"
                    }
                  >
                    {PAYMENT_METHOD_LABEL[m]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Field
          label="Açıklama (opsiyonel)"
          value={description}
          onChangeText={setDescription}
          placeholder="Örn. Nakit tahsilat"
        />

        {error ? <Text className="text-red-600">{error}</Text> : null}

        <Button
          title="Tahsilatı kaydet"
          onPress={onSubmit}
          disabled={!valid}
          loading={recordPayment.isPending}
        />
      </Card>
    </ScrollView>
  );
}
