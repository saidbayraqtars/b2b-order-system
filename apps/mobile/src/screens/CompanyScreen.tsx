import { useEffect, useLayoutEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useCompanies } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { isFieldRole, useAuthStore } from "@/store/auth";
import { useCart, cartTotals } from "@/store/cart";
import { Button, Card, Empty, ErrorState, Loading, Row } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

// Hub for one customer. Reps arrive here from the portfolio list; company users
// land here directly and the single row from /api/companies is their own firm.
export default function CompanyScreen({ navigation, route }: ScreenProps<"Company">) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const field = isFieldRole(user);

  const { data, isPending, error, refetch } = useCompanies();
  const paramId = route.params?.companyId;
  const company = paramId ? data?.find((c) => c.id === paramId) : data?.[0];

  const setCompany = useCart((s) => s.setCompany);
  const lines = useCart((s) => s.lines);
  const cartCompanyId = useCart((s) => s.companyId);
  const totals = cartTotals(lines);

  // Switching customer resets the cart — prices are company-specific.
  useEffect(() => {
    if (company) setCompany(company.id);
  }, [company, setCompany]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: company?.name ?? route.params?.companyName ?? "Firma",
      // Company users have no list to go back to, so they log out from here.
      headerRight: field
        ? undefined
        : () => (
            <Pressable onPress={() => void logout()} accessibilityRole="button">
              <Text className="text-indigo-600">Çıkış</Text>
            </Pressable>
          ),
    });
  }, [navigation, company, route.params?.companyName, field, logout]);

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!company) return <Empty text="Firma bulunamadı." />;

  const nav = { companyId: company.id, companyName: company.name };
  const cartCount = cartCompanyId === company.id ? totals.itemCount : 0;

  return (
    <ScrollView
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      contentContainerClassName="gap-4 p-4 pb-10"
    >
      <Card>
        <Text className="mb-2 text-lg font-bold text-neutral-900 dark:text-neutral-100">
          {company.name}
        </Text>
        {company.city ? (
          <Text className="mb-2 text-sm text-neutral-500">
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
        {field ? (
          <>
            <Button
              title="Ziyaret (check-in)"
              variant="secondary"
              onPress={() => navigation.navigate("CheckIn", nav)}
            />
            <Button
              title="Tahsilat"
              variant="secondary"
              onPress={() => navigation.navigate("Payment", nav)}
            />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}
