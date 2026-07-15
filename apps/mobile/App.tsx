import "./global.css";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text, View } from "react-native";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
          <View className="flex-1 items-center justify-center gap-2 px-6">
            <Text className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              B2B Mobile
            </Text>
            <Text className="text-neutral-500">Plasiyer &amp; Müşteri uygulaması</Text>
          </View>
          <StatusBar style="auto" />
        </SafeAreaView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
