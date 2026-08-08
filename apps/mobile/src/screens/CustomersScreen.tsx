import { useLayoutEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { hasAnyPermission, hasPermission } from "@repo/types";
import { useCompanies, useVisitRequests } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { Badge, Card, Empty, ErrorState, Loading } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

// Sales-rep home: the portfolio (Company.salesRepId == me), searchable, with the
// cari position on each row so the rep sees credit headroom before selling.
export default function CustomersScreen({ navigation }: ScreenProps<"Customers">) {
  const { data, isPending, error, refetch, isRefetching } = useCompanies();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");

  const canPlanVisits = hasPermission(user?.permissions, "visits.manage");
  const canDispatch = hasAnyPermission(user?.permissions, [
    "delivery.confirm",
    "orders.fulfil",
  ]);
  // Today's calls, only so the button can carry a count — a rep with three
  // dealers waiting should see that before scrolling a portfolio of eighty.
  const visits = useVisitRequests(
    canPlanVisits ? new Date().toISOString().slice(0, 10) : undefined,
  );
  const waiting = (visits.data ?? []).filter(
    (v) => v.status === "OPEN" || v.status === "PLANNED",
  ).length;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("Account")}
          accessibilityRole="button"
        >
          <Text className="text-primary">Hesabım</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const companies = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return data ?? [];
    return (data ?? []).filter((c) =>
      c.name.toLocaleLowerCase("tr").includes(q),
    );
  }, [data, search]);

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <View className="flex-1 bg-surface2">
      <View className="gap-3 p-4">
        <View className="flex-row gap-2">
          {canPlanVisits ? (
            <NavTile
              label={waiting ? `Ziyaret planı (${waiting})` : "Ziyaret planı"}
              onPress={() => navigation.navigate("VisitPlan")}
            />
          ) : null}
          <NavTile
            label="Hedeflerim"
            onPress={() => navigation.navigate("Targets")}
          />
          <NavTile
            label="Siparişler"
            onPress={() => navigation.navigate("Orders")}
          />
        </View>
        {canDispatch ? (
          <NavTile
            label="Teslimatlar"
            onPress={() => navigation.navigate("Deliveries")}
          />
        ) : null}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Müşteri ara"
          className="h-11 rounded-xl border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted"
        />
      </View>

      <FlatList
        data={companies}
        keyExtractor={(c) => c.id}
        contentContainerClassName="gap-3 px-4 pb-8"
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        ListEmptyComponent={<Empty text="Portföyünüzde müşteri bulunamadı." />}
        renderItem={({ item }) => {
          const over = Number(item.availableCredit) <= 0;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate("Company", {
                  companyId: item.id,
                  companyName: item.name,
                })
              }
            >
              <Card>
                <View className="gap-2">
                  <View className="flex-row items-start justify-between gap-3">
                    <Text className="flex-1 text-base font-semibold text-fg">
                      {item.name}
                    </Text>
                    <Badge
                      label={over ? "Limit doldu" : "Limit uygun"}
                      tone={over ? "red" : "green"}
                    />
                  </View>
                  {item.city ? (
                    <Text className="text-sm text-fg-muted">
                      {item.district ? `${item.district}, ` : ""}
                      {item.city}
                    </Text>
                  ) : null}
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-fg-muted">Bakiye</Text>
                    <Text className="text-sm font-medium text-fg">
                      {formatMoney(item.currentBalance, item.currency)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-fg-muted">
                      Kullanılabilir limit
                    </Text>
                    <Text className="text-sm font-medium text-fg">
                      {formatMoney(item.availableCredit, item.currency)}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function NavTile({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-11 flex-1 items-center justify-center rounded-xl border border-border-strong bg-surface px-2"
    >
      <Text
        numberOfLines={1}
        className="text-sm font-medium text-fg"
      >
        {label}
      </Text>
    </Pressable>
  );
}
