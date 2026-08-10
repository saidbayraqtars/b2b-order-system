import { Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsOffline, usePendingWrites } from "@/lib/offline";

// Çevrimdışı şeridi.
//
// Neden görünür olmak zorunda: uygulama çevrimdışıyken de çalışıyor ve tam bu
// yüzden fark edilmiyor. Ekrandaki stok yarım saat öncesinin sayısı olabilir,
// girilen tahsilat henüz sunucuya gitmemiş olabilir. Şerit, ikisini de yazıyor
// — "kaydedildi" diyen bir ekranın altında sessizce bekleyen bir kuyruk,
// güvenilmez bir uygulamadan beter.

export function OfflineBanner() {
  const offline = useIsOffline();
  const client = useQueryClient();
  const pending = usePendingWrites(client);
  const insets = useSafeAreaInsets();

  // Bağlantı varken bile kuyrukta iş kalabiliyor (gönderiliyor olabilir);
  // ikisinden biri varsa şerit duruyor.
  if (!offline && pending === 0) return null;

  return (
    <View
      style={{ paddingTop: insets.top }}
      className={offline ? "bg-amber-500" : "bg-indigo-600"}
    >
      <Text className="px-4 py-1.5 text-center text-sm font-medium text-white">
        {offline
          ? pending > 0
            ? `Çevrimdışı · ${pending} kayıt bağlantı gelince gönderilecek`
            : "Çevrimdışı · son bilinen veriler gösteriliyor"
          : `${pending} kayıt gönderiliyor…`}
      </Text>
    </View>
  );
}
