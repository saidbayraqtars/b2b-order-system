import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Text, View } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { registerForPush } from "@/lib/push";
import { Button } from "@/components/ui";

// Bildirim durumu ve tek düğmelik onarımı.
//
// Neden ekranda bir yer kaplıyor: bildirim sessizce çalışmayan bir özellik.
// İzin reddedilmişse hiçbir hata görünmüyor, uygulama normal çalışıyor ve
// kullanıcı yalnızca beklediği uyarının gelmediğini fark ediyor — o da genelde
// bir siparişi kaçırdıktan sonra.

type Status = "unknown" | "granted" | "askable" | "blocked" | "unsupported";

export function PushSettings() {
  const [status, setStatus] = useState<Status>("unknown");
  const [busy, setBusy] = useState(false);

  const read = useCallback(async () => {
    if (!Device.isDevice) {
      setStatus("unsupported");
      return;
    }
    const perm = await Notifications.getPermissionsAsync();
    setStatus(perm.granted ? "granted" : perm.canAskAgain ? "askable" : "blocked");
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      await registerForPush();
      await read();
    } finally {
      setBusy(false);
    }
  }, [read]);

  return (
    <View className="gap-3">
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">
        {MESSAGES[status]}
      </Text>

      {status === "askable" ? (
        <Button title="Bildirimleri aç" loading={busy} onPress={() => void enable()} />
      ) : null}

      {status === "blocked" ? (
        <Button
          title="Telefon ayarlarını aç"
          variant="secondary"
          // Android izni bir kez reddedildikten sonra uygulama içinden bir daha
          // sorulamıyor; tek yol sistem ayarları.
          onPress={() => void Linking.openSettings()}
        />
      ) : null}

      {status === "granted" ? (
        <Button
          title="Bu cihazı yeniden bağla"
          variant="secondary"
          loading={busy}
          onPress={() => void enable()}
        />
      ) : null}
    </View>
  );
}

const MESSAGES: Record<Status, string> = {
  unknown: "Durum okunuyor…",
  granted:
    "Bildirimler açık. Yeni sipariş, onay sonucu, ziyaret çağrısı ve teslimat ataması bu telefona düşer.",
  askable: "Bildirimler kapalı. Açarsanız sipariş ve ziyaret uyarıları gelir.",
  blocked:
    Platform.OS === "android"
      ? "Bildirim izni reddedilmiş. Ayarlar > Uygulamalar > B2B > Bildirimler'den açabilirsiniz."
      : "Bildirim izni kapalı. Ayarlar'dan açabilirsiniz.",
  unsupported: "Bildirimler yalnızca gerçek cihazda çalışır (emülatörde değil).",
};
