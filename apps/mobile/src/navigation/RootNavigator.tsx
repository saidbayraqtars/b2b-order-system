import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
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

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, hydrated, hydrate } = useAuthStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) return <Loading />;

  const field = isFieldRole(user);

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
            {field ? (
              <Stack.Screen
                name="Customers"
                component={CustomersScreen}
                options={{ title: "Müşterilerim" }}
              />
            ) : null}
            <Stack.Screen
              name="Company"
              component={CompanyScreen}
              options={{ title: "Firma" }}
            />
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
            <Stack.Screen
              name="CheckIn"
              component={CheckInScreen}
              options={{ title: "Ziyaret" }}
            />
            <Stack.Screen
              name="Payment"
              component={PaymentScreen}
              options={{ title: "Tahsilat" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
