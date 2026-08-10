import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiFetch } from "@/lib/api";
import { currentAuthToken } from "@/lib/session-token";

// Anlık bildirim: kayıt, izin ve dokunulduğunda gidilecek yer.
//
// Jeton sunucuda kullanıcıya bağlanıyor (`POST /api/mobile/push-token`), çıkışta
// çözülüyor. Bağın çözülmesi önemli: ortak kullanılan bir telefonda jeton eski
// kullanıcıda kalırsa, sonraki kişi öncekinin sipariş ve tahsilat bildirimlerini
// görür.

// Uygulama açıkken gelen bildirim de görünsün. Varsayılan davranış, uygulama ön
// plandayken bildirimi yutmak; sahadaki kullanım biçimi buna ters — telefon
// zaten uygulamada açık duruyor ve "yeni sipariş" tam o sırada düşüyor.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Bildirime dokunulduğunda gidilecek yer — sunucunun `data` alanı. */
export interface PushTarget {
  screen?: string;
  orderId?: string;
  orderNumber?: string;
}

let currentToken: string | null = null;


/**
 * İzin ister, jetonu alır ve sunucuya bağlar.
 *
 * Giriş yapıldıktan **sonra** çağrılıyor, açılışta değil: izni ilk açılışta
 * sormak, ne için istendiği belli olmadığı için reddedilme ihtimalini artırıyor
 * ve reddedilen izin Android'de bir daha sorulamıyor.
 */
export async function registerForPush(): Promise<void> {
  // Emülatörde jeton üretilemiyor; denemek sadece log kirletir.
  if (!Device.isDevice) return;

  try {
    if (Platform.OS === "android") {
      // Kanal, jetondan önce kurulmak zorunda: Android 8+ kanalsız bildirimi
      // hiç göstermiyor ve gönderim tarafında `channelId: "default"` yazılı.
      await Notifications.setNotificationChannelAsync("default", {
        name: "Genel",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return;

    // Expo'nun push servisi jetonu projeye bağlıyor; kimlik app.json'dan
    // geliyor ve derlemede gömülü.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) return;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    currentToken = data;

    await apiFetch("/api/mobile/push-token", {
      method: "POST",
      body: {
        token: data,
        platform: Platform.OS === "ios" ? "ios" : "android",
        deviceName: Device.deviceName ?? undefined,
      },
      token: currentAuthToken(),
    });
  } catch (err) {
    // Bildirim bir kolaylık, giriş akışının şartı değil. Kayıt düşerse
    // uygulama çalışmaya devam eder.
    console.warn("[push] kayıt olunamadı", err);
  }
}

/** Çıkışta cihazı hesaptan çözer. Sunucuya ulaşılamazsa sessizce geçer. */
export async function unregisterPush(authToken: string | null): Promise<void> {
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  try {
    await apiFetch("/api/mobile/push-token", {
      method: "DELETE",
      body: { token },
      token: authToken,
    });
  } catch {
    // Jeton sunucuda kalırsa bildirim yanlış kişiye düşebilir; ama tek
    // çaresizlik hâli bu ve çıkışı engellemek daha kötü. Sunucu tarafında
    // aynı jetonla giriş yapan bir sonraki kullanıcı satırı devralıyor.
  }
}

/**
 * Bildirime dokunulduğunda çağrılır — uygulama kapalıyken açılan bildirim de
 * dahil (`getLastNotificationResponseAsync`).
 */
export function useNotificationTap(onTap: (target: PushTarget) => void): void {
  const handler = useRef(onTap);
  handler.current = onTap;

  useEffect(() => {
    let alive = true;

    // Uygulama bildirime dokunularak açıldıysa yanıt burada bekliyor; olay
    // dinleyicisi kurulmadan önce olup bittiği için ayrıca sorulmak zorunda.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!alive || !response) return;
      handler.current(targetOf(response));
    });

    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      handler.current(targetOf(r)),
    );

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
}

function targetOf(response: Notifications.NotificationResponse): PushTarget {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | undefined;
  return {
    screen: typeof data?.screen === "string" ? data.screen : undefined,
    orderId: typeof data?.orderId === "string" ? data.orderId : undefined,
    orderNumber:
      typeof data?.orderNumber === "string" ? data.orderNumber : undefined,
  };
}
