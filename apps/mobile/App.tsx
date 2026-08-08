import "./global.css";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RootNavigator from "@/navigation/RootNavigator";
import { ThemeProvider } from "@/lib/theme";
import { ApiError } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Auth/permission failures never recover by retrying.
      retry: (count, error) =>
        error instanceof ApiError && error.status < 500 ? false : count < 2,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* Tasarım paketi en dışta: değişkenleri yazan görünüm, gezinme dahil
            her şeyin üstünde durmalı. */}
        <ThemeProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
