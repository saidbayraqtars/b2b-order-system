import { prisma } from "@repo/database";

// Telefona anlık bildirim.
//
// Taşıyıcı Expo'nun push servisi: uygulama zaten Expo ile derleniyor ve jetonu
// o üretiyor. Google'ın FCM'ine doğrudan konuşmak için sunucu anahtarı, kiracı
// başına ayrı yapılandırma ve bir de sertifika döngüsü gerekirdi; Expo bunu
// kendi tarafında tutuyor.
//
// Bu dosyanın kuralları e-posta bildirimleriyle aynı ([[notification.ts]]):
// **hiçbir zaman fırlatmaz** ve **işlem dışında çağrılır**. Bir bildirim, olmuş
// bitmiş bir işin duyurusudur; duyuru düşerse iş geri alınmaz.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo tek istekte en çok 100 mesaj kabul ediyor. */
const CHUNK = 100;

export interface PushPayload {
  title: string;
  body: string;
  /**
   * Bildirime dokununca uygulamanın nereye gideceği. Ekran adı ve parametreler
   * — metin değil, veri: telefon tarafındaki yönlendirici bunu okuyor.
   */
  data?: Record<string, string>;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Bir cihazı kullanıcıya bağlar.
 *
 * Jeton tekil ve **kullanıcı taşınabilir**: aynı telefondan başka biri giriş
 * yaptığında satır yeni kullanıcıya geçiyor. Bu bir güvenlik gereği — jeton
 * eski sahibinde kalsaydı, cihazı devralan kişi önceki kullanıcının sipariş ve
 * tahsilat bildirimlerini okumaya devam ederdi.
 */
export async function registerPushDevice(input: {
  userId: string;
  token: string;
  platform: string;
  deviceName?: string | null;
}): Promise<void> {
  const token = input.token.trim();
  if (!isExpoPushToken(token)) return;

  const data = {
    userId: input.userId,
    platform: input.platform.slice(0, 20),
    deviceName: input.deviceName?.slice(0, 100) ?? null,
    lastSeenAt: new Date(),
    // Cihaz geri geldiyse yeniden açılıyor: kullanıcı bildirimi kapatıp
    // açtığında ya da uygulamayı silip kurduğunda aynı jetona dönülebiliyor.
    disabledAt: null,
  };

  try {
    await prisma.pushDevice.upsert({
      where: { token },
      create: { token, ...data },
      update: data,
    });
  } catch (err) {
    console.error("[push] cihaz kaydedilemedi", err);
  }
}

/**
 * Çıkış yapan cihazı düşürür. Kullanıcı kimliği de aranıyor: elindeki jetonu
 * bilen biri başkasının cihazını sustur(a)masın.
 */
export async function removePushDevice(
  userId: string,
  token: string,
): Promise<void> {
  try {
    await prisma.pushDevice.deleteMany({ where: { userId, token } });
  } catch (err) {
    console.error("[push] cihaz silinemedi", err);
  }
}

/**
 * Bildirimi gönderir. Kime gideceği **kullanıcı kimliğinden** çözülüyor, çağıran
 * jeton veremiyor: yanlış listeye gönderilen bir bildirim, sipariş tutarını
 * başka bir firmaya okutur.
 *
 * Dönüş, gönderilen cihaz sayısı — çağıran isterse günlüğe yazar, ama kimse
 * beklemek zorunda değil.
 */
export async function sendPush(
  userIds: string[],
  payload: PushPayload,
): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return 0;

  let devices: Array<{ token: string }>;
  try {
    devices = await prisma.pushDevice.findMany({
      where: { userId: { in: ids }, disabledAt: null },
      select: { token: true },
    });
  } catch (err) {
    console.error("[push] cihazlar okunamadı", err);
    return 0;
  }
  if (devices.length === 0) return 0;

  let sent = 0;
  for (let i = 0; i < devices.length; i += CHUNK) {
    const slice = devices.slice(i, i + CHUNK);
    const messages = slice.map((d) => ({
      to: d.token,
      title: payload.title,
      body: payload.body,
      ...(payload.data ? { data: payload.data } : {}),
      sound: "default" as const,
      // Android'de bildirimler bir kanala düşüyor; kanal tanımlanmazsa sistem
      // kendi varsayılanını kullanıyor ve kullanıcı türe göre kısamıyor.
      channelId: "default",
    }));

    const tickets = await postToExpo(messages);
    if (!tickets) continue;

    const dead: string[] = [];
    tickets.forEach((ticket, index) => {
      if (ticket.status === "ok") {
        sent += 1;
        return;
      }
      // Tek anlamlı hata bu: uygulama silinmiş ya da bildirim kapatılmış.
      // Diğerleri (hız sınırı, geçici sunucu hatası) cihazı suçlu göstermez.
      if (ticket.details?.error === "DeviceNotRegistered") {
        const token = slice[index]?.token;
        if (token) dead.push(token);
      } else {
        console.error("[push] gönderilemedi", ticket.message ?? ticket.details);
      }
    });

    if (dead.length > 0) {
      await prisma.pushDevice
        .updateMany({
          where: { token: { in: dead } },
          data: { disabledAt: new Date() },
        })
        .catch(() => {
          // Kapatamadıysak bir dahaki gönderimde yine denenir; zararı yok.
        });
    }
  }

  return sent;
}

async function postToExpo(
  messages: unknown[],
): Promise<ExpoTicket[] | null> {
  // Expo'nun sunucusu takılırsa isteğin süresiz beklememesi gerekiyor: bu çağrı
  // bir sipariş kaydedildikten *sonra* yapılıyor ve HTTP yanıtını geciktiriyor.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(messages),
      signal: abort.signal,
    });

    if (!res.ok) {
      console.error("[push] Expo yanıtı", res.status, await res.text());
      return null;
    }

    const json = (await res.json()) as { data?: ExpoTicket[] };
    return json.data ?? null;
  } catch (err) {
    console.error("[push] Expo'ya ulaşılamadı", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Jeton biçimi. Doğrulama güvenlik sınırı değil — çöp girdiyi Expo'ya kadar
 * taşımamak için: veritabanına yazılan her satır bir gönderim denemesi demek.
 */
function isExpoPushToken(value: string): boolean {
  return (
    /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value) && value.length <= 200
  );
}
