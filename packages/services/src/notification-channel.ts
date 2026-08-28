import { sendMail, type MailResult } from "./mail";
import { sendPush, type PushPayload } from "./push";

// Bildirim kanalı kayıt defteri.
//
// Bugün iki kanal var (e-posta, push) ve ikisi de `notification.ts` içinde
// **elle** çağrılıyordu: her `notifyX` fonksiyonu önce `sendMail`, sonra
// `sendPush` diyordu. Üçüncü bir kanal (WhatsApp, SMS) eklemek o hâlde her
// çağrı yerine dokunmak demekti.
//
// Kayıt defteri deseni bu depoda tanıdık: rapor veri kümeleri, kampanya
// kuralları, ödeme sağlayıcıları, bakım işleri. Kanal **veri**; `notify`
// yalnızca "şu kitleye şu mesajı gönder" diyor ve hangi kanalların açık olduğu
// buranın bileceği iş.
//
// **WhatsApp adaptörü yazılmadı** ve bu bilinçli: Business API ücretli, onay
// istiyor ve sözleşme olmadan yazılacak kod tahmine dayanır — sanal POS
// adaptörüyle aynı gerekçe (bkz. KALAN-ISLER §7). Yapılan şey, gelecekteki
// adaptörün **tek dosyaya** sığmasını sağlamak: `NotificationChannel` yazıp
// `CHANNELS`e eklemek yeterli, `notification.ts`e dokunulmuyor.

/** Kime gidecek. Kanal kendi işine yarayan alanı okuyor, gerisini yok sayıyor. */
export interface NotificationAudience {
  /** E-posta adresleri — benzersiz ve doğrulanmış olduğu varsayılmıyor. */
  emails: string[];
  /** Kullanıcı kimlikleri. Push cihazı, ileride telefon numarası buradan bulunur. */
  userIds: string[];
}

/** Ne gidecek. Kanallar aynı olayı kendi biçimlerinde anlatıyor. */
export interface NotificationMessage {
  subject: string;
  /** Uzun metin — e-posta gövdesi. */
  text: string;
  html?: string;
  /**
   * Kısa metin: bildirim balonu, SMS, WhatsApp. Uzun gövdeyi kırpmak yerine
   * ayrı yazılıyor — "Sipariş ORD-… oluşturuldu" ile üç paragraflık bir
   * e-posta aynı cümle değil.
   */
  short: string;
  /** Bildirime dokununca gidilecek yer; kanal kendi biçimine çeviriyor. */
  route?: PushPayload["data"];
}

export interface ChannelResult {
  channel: string;
  ok: boolean;
  /** Hangi taşıyıcı kullanıldı — denetim kaydına yazılıyor. */
  transport: string;
  error?: string;
  /** Kanal bu kurulumda yapılandırılmamış ya da kitle boş: gönderim denenmedi. */
  skipped?: boolean;
}

export interface NotificationChannel {
  /** Kayıt defteri anahtarı; denetim kaydında ve ayarlarda görünen ad bu. */
  key: string;
  label: string;
  /**
   * Bu kurulumda kullanılabilir mi. `false` ise kanal **sessizce** atlanıyor:
   * yapılandırılmamış bir kanal bir hata değil, bir tercih.
   */
  isConfigured: () => boolean;
  send: (
    audience: NotificationAudience,
    message: NotificationMessage,
  ) => Promise<ChannelResult>;
}

// ─────────────────────────────────────────────
// KANALLAR
// ─────────────────────────────────────────────

const emailChannel: NotificationChannel = {
  key: "email",
  label: "E-posta",
  // Posta katmanının kendi yedeği var (yapılandırma yoksa günlüğe yazıyor), o
  // yüzden burada her zaman "açık": bir e-posta hiçbir koşulda kaybolmuyor.
  isConfigured: () => true,
  send: async (audience, message) => {
    if (audience.emails.length === 0) {
      return { channel: "email", ok: true, transport: "none", skipped: true };
    }
    let result: MailResult;
    try {
      result = await sendMail({
        to: audience.emails,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      });
    } catch (err) {
      result = {
        ok: false,
        transport: "smtp",
        error: err instanceof Error ? err.message : "bilinmeyen hata",
      };
    }
    return {
      channel: "email",
      ok: result.ok,
      transport: result.transport,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};

const pushChannel: NotificationChannel = {
  key: "push",
  label: "Telefon bildirimi",
  isConfigured: () => true,
  send: async (audience, message) => {
    if (audience.userIds.length === 0) {
      return { channel: "push", ok: true, transport: "none", skipped: true };
    }
    try {
      await sendPush(audience.userIds, {
        title: message.subject,
        body: message.short,
        ...(message.route ? { data: message.route } : {}),
      });
      return { channel: "push", ok: true, transport: "expo" };
    } catch (err) {
      return {
        channel: "push",
        ok: false,
        transport: "expo",
        error: err instanceof Error ? err.message : "bilinmeyen hata",
      };
    }
  },
};

/**
 * Kayıtlı kanallar.
 *
 * Yeni bir kanal eklemek: `NotificationChannel` yazıp bu diziye koymak.
 * `notification.ts` değişmiyor, çağrı yerleri değişmiyor.
 */
export const CHANNELS: readonly NotificationChannel[] = [
  emailChannel,
  pushChannel,
];

export function findChannel(key: string): NotificationChannel | undefined {
  return CHANNELS.find((c) => c.key === key);
}

/**
 * Mesajı açık kanalların hepsine gönderir.
 *
 * **Hiçbir zaman fırlatmıyor** — `notification.ts`in kuralı burada da geçerli:
 * bildirim, olmuş bitmiş bir işin duyurusudur ve duyuru düşerse iş geri
 * alınmaz. Kanallar **paralel** çalışıyor: e-postanın SMTP gidiş-dönüşünü
 * beklerken push'u geciktirmenin bir sebebi yok.
 */
export async function broadcast(
  audience: NotificationAudience,
  message: NotificationMessage,
  opts: { only?: readonly string[] } = {},
): Promise<ChannelResult[]> {
  const active = CHANNELS.filter(
    (c) => c.isConfigured() && (!opts.only || opts.only.includes(c.key)),
  );

  return Promise.all(
    active.map(async (c) => {
      try {
        return await c.send(audience, message);
      } catch (err) {
        return {
          channel: c.key,
          ok: false,
          transport: "unknown",
          error: err instanceof Error ? err.message : "bilinmeyen hata",
        };
      }
    }),
  );
}
