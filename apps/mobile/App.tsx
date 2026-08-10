import "./global.css";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import RootNavigator from "@/navigation/RootNavigator";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ApiError } from "@/lib/api";
import {
  connectOnlineManager,
  persister,
  registerOfflineMutations,
} from "@/lib/offline";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Auth/permission failures never recover by retrying.
      retry: (count, error) =>
        error instanceof ApiError && error.status < 500 ? false : count < 2,
      // Şebeke yokken istek denenmiyor ama **önbellekteki veri veriliyor**:
      // varsayılan "online" kipinde sorgu askıda kalıyor ve ekran boş açılıyor,
      // oysa yarım saatlik bir katalog hiç yoktan iyi.
      networkMode: "offlineFirst",
      // Diskten okunan önbelleğin ne kadar süre sonra çöp sayılacağı. Bir hafta:
      // hafta sonu kapalı kalan bir telefon pazartesi hâlâ dolu açılsın.
      gcTime: 7 * 24 * 60 * 60_000,
    },
    mutations: {
      // Yazma çevrimdışıyken hata vermiyor, duruyor. Hangi yazmaların böyle
      // durabileceği lib/offline.ts'te tek tek sayılı — sipariş bunlara dahil
      // değil.
      networkMode: "offlineFirst",
    },
  },
});

registerOfflineMutations(queryClient);

export default function App() {
  useEffect(() => {
    connectOnlineManager();
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60_000,
        // Sürüm, önbelleğin biçimiyle birlikte değişmeli: eski bir kayıtta
        // olmayan bir alanı okuyan yeni bir ekran, ilk açılışta çöküyor.
        buster: "v1",
      }}
      onSuccess={() => {
        // Disk okunduktan sonra: kuyrukta bekleyen tahsilat/ziyaret varsa
        // şimdi gönderiliyor. Önce çağrılırsa kuyruk henüz boş olurdu.
        void queryClient.resumePausedMutations();
      }}
    >
      <SafeAreaProvider>
        <OfflineBanner />
        <RootNavigator />
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
