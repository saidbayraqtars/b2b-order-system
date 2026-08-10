import { useLayoutEffect } from "react";
import { FlatList, Text, View } from "react-native";
import { useCompanyAging, useStatement } from "@/lib/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge, Card, Empty, ErrorState, Loading, Row } from "@/components/ui";
import type { StatementRow } from "@/lib/types";
import type { ScreenProps } from "@/navigation/types";

// Read-only cari ekstre. A rep opens it before a collection visit to see what
// is actually overdue; a company user sees their own account.

const BUCKETS = [
  ["current", "Vadesi gelmemiş"],
  ["d1_30", "1-30 gün"],
  ["d31_60", "31-60 gün"],
  ["d61_90", "61-90 gün"],
  ["d90_plus", "90+ gün"],
] as const;

export default function StatementScreen({
  navigation,
  route,
}: ScreenProps<"Statement">) {
  const { companyId, companyName } = route.params;
  const statement = useStatement(companyId);
  const aging = useCompanyAging(companyId);

  useLayoutEffect(() => {
    navigation.setOptions({ title: `Ekstre · ${companyName}` });
  }, [navigation, companyName]);

  if (statement.isPending) return <Loading />;
  if (statement.error) {
    return (
      <ErrorState
        error={statement.error}
        onRetry={() => void statement.refetch()}
      />
    );
  }

  const s = statement.data;
  const currency = s.company.currency;
  const available = Number(s.company.creditLimit) - Number(s.closingBalance);

  return (
    <FlatList
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      contentContainerClassName="gap-3 p-4 pb-10"
      data={[...s.rows].reverse()} // newest first reads better on a phone
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <View className="gap-3">
          <Card>
            <Row
              label="Kredi limiti"
              value={formatMoney(s.company.creditLimit, currency)}
            />
            <Row label="Borç" value={formatMoney(s.totalDebit, currency)} />
            <Row label="Alacak" value={formatMoney(s.totalCredit, currency)} />
            <Row
              label="Bakiye"
              value={formatMoney(s.closingBalance, currency)}
              strong
            />
            <Row
              label="Kullanılabilir"
              value={formatMoney(available, currency)}
            />
            <Text className="mt-1 text-xs text-neutral-500">
              Vade: {s.company.paymentTermDays} gün
            </Text>
          </Card>

          {aging.data ? (
            <Card>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Yaşlandırma
                </Text>
                {Number(aging.data.overdue) > 0 ? (
                  <Badge
                    label={`Vadesi geçen ${formatMoney(aging.data.overdue, currency)}`}
                    tone="red"
                  />
                ) : (
                  <Badge label="Vadesi geçen borç yok" tone="green" />
                )}
              </View>
              {BUCKETS.map(([key, label]) => (
                <Row
                  key={key}
                  label={label}
                  value={formatMoney(aging.data!.buckets[key], currency)}
                />
              ))}
              {Number(aging.data.unappliedCredit) > 0 ? (
                <Text className="mt-1 text-xs text-neutral-500">
                  Mahsup edilmemiş tahsilat:{" "}
                  {formatMoney(aging.data.unappliedCredit, currency)}
                </Text>
              ) : null}
            </Card>
          ) : null}

          <Text className="px-1 pt-1 font-semibold text-neutral-900 dark:text-neutral-100">
            Hareketler
          </Text>
        </View>
      }
      renderItem={({ item }) => <LedgerRow row={item} currency={currency} />}
      ListEmptyComponent={<Empty text="Cari hareket yok." />}
      onRefresh={() => {
        void statement.refetch();
        void aging.refetch();
      }}
      refreshing={statement.isFetching}
    />
  );
}

function LedgerRow({ row, currency }: { row: StatementRow; currency: string }) {
  const isDebit = row.type === "DEBIT";
  return (
    <Card>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-neutral-900 dark:text-neutral-100">
            {row.description}
          </Text>
          <Text className="text-xs text-neutral-500">
            {formatDateTime(row.createdAt)}
            {row.recordedByName ? ` · ${row.recordedByName}` : ""}
          </Text>
        </View>
        <View className="items-end">
          <Text
            className={
              isDebit
                ? "font-semibold text-neutral-900 dark:text-neutral-100"
                : "font-semibold text-green-700 dark:text-green-400"
            }
          >
            {isDebit ? "+" : "−"}
            {formatMoney(isDebit ? row.debit : row.credit, currency)}
          </Text>
          <Text className="text-xs text-neutral-500">
            Bakiye {formatMoney(row.balance, currency)}
          </Text>
        </View>
      </View>
    </Card>
  );
}
