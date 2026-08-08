import { useLayoutEffect } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { hasPermission } from "@repo/types";
import { useAnnouncements, useCart, useCompanies } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { isFieldRole, useAuthStore } from "@/store/auth";
import { Button, Card, Empty, ErrorState, Loading, Row } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

// Hub for one customer. Reps arrive here from the portfolio list; company users
// land here directly and the single row from /api/companies is their own firm.
export default function CompanyScreen({ navigation, route }: ScreenProps<"Company">) {
  const user = useAuthStore((s) => s.user);
  const field = isFieldRole(user);

  const { data, isPending, error, refetch } = useCompanies();
  const paramId = route.params?.companyId;
  const company = paramId ? data?.find((c) => c.id === paramId) : data?.[0];

  const cart = useCart(company?.id ?? "");
  const announcements = useAnnouncements(company?.id ?? "");
  const cartCount = (cart.data?.lines ?? []).reduce((s, l) => s + l.quantity, 0);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: company?.name ?? route.params?.companyName ?? "Firma",
      // Company users have no list to go back to, so their account (and the
      // logout inside it) hangs off this screen instead.
      headerRight: field
        ? undefined
        : () => (
            <Pressable
              onPress={() => navigation.navigate("Account")}
              accessibilityRole="button"
            >
              <Text className="text-primary">Hesabım</Text>
            </Pressable>
          ),
    });
  }, [navigation, company, route.params?.companyName, field]);

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!company) return <Empty text="Firma bulunamadı." />;

  const nav = { companyId: company.id, companyName: company.name };
  const canCollect =
    field && hasPermission(user?.permissions, "cash.manage");
  const canVisit = field && hasPermission(user?.permissions, "visits.manage");

  return (
    <ScrollView
      className="flex-1 bg-surface2"
      contentContainerClassName="gap-4 p-4 pb-10"
    >
      {/* Duyurular sunucuda süzülüyor: "yalnızca bayilere" işaretli bir duyuru
          başka gruptaki firmaya hiç gönderilmez, gönderilip burada gizlenmez. */}
      {(announcements.data ?? []).map((a) => (
        <Card key={a.id} className="border-primary/40">
          <Text className="font-semibold text-fg">
            {a.title}
          </Text>
          {a.body ? (
            <Text className="mt-1 text-sm text-fg-muted">
              {a.body}
            </Text>
          ) : null}
          {a.linkUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(a.linkUrl!).catch(() => {})}
            >
              <Text className="mt-1 text-sm text-primary">
                {a.linkLabel ?? "Ayrıntı"}
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ))}

      <Card>
        <Text className="mb-2 text-lg font-bold text-fg">
          {company.name}
        </Text>
        {company.city ? (
          <Text className="mb-2 text-sm text-fg-muted">
            {company.district ? `${company.district}, ` : ""}
            {company.city}
          </Text>
        ) : null}
        <Row
          label="Kredi limiti"
          value={formatMoney(company.creditLimit, company.currency)}
        />
        <Row
          label="Güncel bakiye"
          value={formatMoney(company.currentBalance, company.currency)}
        />
        <Row
          label="Kullanılabilir"
          value={formatMoney(company.availableCredit, company.currency)}
          strong
        />
      </Card>

      <View className="gap-3">
        <Button title="Katalog / Sipariş" onPress={() => navigation.navigate("Catalog", nav)} />
        <Button
          title={cartCount ? `Sepet (${cartCount} adet)` : "Sepet"}
          variant="secondary"
          onPress={() => navigation.navigate("Cart", nav)}
        />
        <Button
          title="Siparişler"
          variant="secondary"
          onPress={() => navigation.navigate("Orders", nav)}
        />
        <Button
          title="Cari Ekstre"
          variant="secondary"
          onPress={() => navigation.navigate("Statement", nav)}
        />
        {canVisit ? (
          <Button
            title="Ziyaret (check-in)"
            variant="secondary"
            onPress={() => navigation.navigate("CheckIn", nav)}
          />
        ) : null}
        {canCollect ? (
          <Button
            title="Tahsilat"
            variant="secondary"
            onPress={() => navigation.navigate("Payment", nav)}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
