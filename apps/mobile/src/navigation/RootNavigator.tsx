import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { hasAnyPermission, hasPermission } from "@repo/types";
import { useAuthStore, isFieldRole } from "@/store/auth";
import { Loading } from "@/components/ui";
import type { RootStackParamList } from "./types";
import LoginScreen from "@/screens/LoginScreen";
import CustomersScreen from "@/screens/CustomersScreen";
import CompanyScreen from "@/screens/CompanyScreen";
import CatalogScreen from "@/screens/CatalogScreen";
import CartScreen from "@/screens/CartScreen";
import OrdersScreen from "@/screens/OrdersScreen";
import OrderDetailScreen from "@/screens/OrderDetailScreen";
import StatementScreen from "@/screens/StatementScreen";
import CheckInScreen from "@/screens/CheckInScreen";
import PaymentScreen from "@/screens/PaymentScreen";
import VisitPlanScreen from "@/screens/VisitPlanScreen";
import TargetsScreen from "@/screens/TargetsScreen";
import DeliveriesScreen from "@/screens/DeliveriesScreen";
import AccountScreen from "@/screens/AccountScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, hydrated, hydrate } = useAuthStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) return <Loading />;

  const field = isFieldRole(user);
  // A courier delivers and nothing else: no catalog, no cart, no cari. The
  // account is not asked what it *is* but what it *may do* — permissions can be
  // taken away one by one, and a screen the server will refuse should not be in
  // the stack for its role's sake.
  const delivers = hasAnyPermission(user?.permissions, [
    "delivery.confirm",
    "orders.fulfil",
  ]);
  const courierOnly = user?.role === "COURIER";
  const canBuy = hasPermission(user?.permissions, "products.view");

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerBackTitle: "Geri" }}>
        {!user ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            {/* İlk ekran sırayla belirlenir: kurye teslimata, saha portföye,
                alıcı kendi firmasına düşer. */}
            {courierOnly ? (
              <Stack.Screen
                name="Deliveries"
                component={DeliveriesScreen}
                options={{ title: "Teslimatlarım" }}
              />
            ) : null}

            {!courierOnly && field ? (
              <Stack.Screen
                name="Customers"
                component={CustomersScreen}
                options={{ title: "Müşterilerim" }}
              />
            ) : null}

            {!courierOnly ? (
              <>
                <Stack.Screen
                  name="Company"
                  component={CompanyScreen}
                  options={{ title: "Firma" }}
                />
                {canBuy ? (
                  <>
                    <Stack.Screen
                      name="Catalog"
                      component={CatalogScreen}
                      options={{ title: "Katalog" }}
                    />
                    <Stack.Screen
                      name="Cart"
                      component={CartScreen}
                      options={{ title: "Sepet" }}
                    />
                  </>
                ) : null}
                <Stack.Screen
                  name="Orders"
                  component={OrdersScreen}
                  options={{ title: "Siparişler" }}
                />
                <Stack.Screen
                  name="OrderDetail"
                  component={OrderDetailScreen}
                  options={{ title: "Sipariş" }}
                />
                <Stack.Screen
                  name="Statement"
                  component={StatementScreen}
                  options={{ title: "Cari Ekstre" }}
                />
              </>
            ) : null}

            {field && hasPermission(user.permissions, "visits.manage") ? (
              <>
                <Stack.Screen
                  name="CheckIn"
                  component={CheckInScreen}
                  options={{ title: "Ziyaret" }}
                />
                <Stack.Screen
                  name="VisitPlan"
                  component={VisitPlanScreen}
                  options={{ title: "Ziyaret planı" }}
                />
              </>
            ) : null}

            {field && hasPermission(user.permissions, "cash.manage") ? (
              <Stack.Screen
                name="Payment"
                component={PaymentScreen}
                options={{ title: "Tahsilat" }}
              />
            ) : null}

            {field ? (
              <Stack.Screen
                name="Targets"
                component={TargetsScreen}
                options={{ title: "Hedeflerim" }}
              />
            ) : null}

            {/* Süper admin hem sahada hem dağıtımda olabilir: kurye ekranı
                yalnızca kuryenin değil, teslimat yetkisi olan herkesin. */}
            {!courierOnly && delivers ? (
              <Stack.Screen
                name="Deliveries"
                component={DeliveriesScreen}
                options={{ title: "Teslimatlar" }}
              />
            ) : null}

            <Stack.Screen
              name="Account"
              component={AccountScreen}
              options={{ title: "Hesabım" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
