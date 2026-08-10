import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// ─────────────────────────────────────────────
// SÜRÜM KANALI — merkezden güncellemenin okuma ucu
// ─────────────────────────────────────────────
//
// Her müşteri kendi sunucusunda çalışıyor (bkz. ürün modeli: paylaşılan tek
// örnek yok). Bu yüzden "merkez" bir sunucu değil, **bir dosya**: satıcının
// yayımladığı sürüm akışı. Her kurulumdaki ajan (`scripts/agent.sh`) o akışı
// okur, kendi sürümüyle karşılaştırır ve politikaya göre ya yalnızca haber
// verir ya da bakım penceresinde güncellemeyi kendisi uygular.
//
// Buradaki kod **yalnızca ajanın bıraktığı durum dosyasını okur.** Üç şeyi
// bilerek yapmıyor:
//
//  1. **Akışı kendisi indirmiyor.** İnternete iki ayrı yerden çıkılsaydı ekran
//     ajanın bilmediği bir sürümü "hazır" gösterebilirdi; oysa güncellemeyi
//     ajan uygular. Ekranda görünen şey, güncellemeyi yapacak olanın gördüğü
//     şey olmalı.
//  2. **Güncellemeyi başlatmıyor.** Web bir kapsayıcının içinde; `docker` ve
//     `git` orada yok. Erişsin diye docker soketi bağlanırsa uygulamayı ele
//     geçiren biri host'ta root olur — bir "Güncelle" düğmesinin bedeli bu.
//     Güncellemeyi host'taki ajan çalıştırır.
//  3. **Durum dosyasına yazmıyor.** Tek yazar ajan; ikinci yazar olsaydı yarı
//     yazılmış dosya okunurdu.

const isoDate = z.string().datetime({ offset: true });

/** Ajanın en son ne yaptığı. */
export const updateRunSchema = z.object({
  startedAt: isoDate,
  finishedAt: isoDate.nullable().default(null),
  fromVersion: z.string().max(100),
  toVersion: z.string().max(100),
  /**
   * `running` bitmeden kalan kayıt: güncelleme yarıda kesilmiş demektir.
   *
   * Geri alma ayrı bir sonuç değil. Ajan, `update.sh` düştüğünde geri alınıp
   * alınmadığını **bilemez**: göç düştüyse hiç dokunulmamıştır, sağlık
   * düştüyse eski imaja dönülmüştür ve iki durumda da çalışan sürüm aynıdır.
   * Ayırt edemeyeceği bir şeyi ayrı gösteren kayıt yalan söyler; sebep
   * mesajda, betiğin son satırlarında duruyor.
   */
  result: z.enum(["running", "success", "failed"]),
  message: z.string().max(2000).default(""),
});
export type UpdateRun = z.infer<typeof updateRunSchema>;

/** Akışın bu kanal için duyurduğu sürüm. */
export const availableReleaseSchema = z.object({
  version: z.string().min(1).max(100),
  releasedAt: isoDate.nullable().default(null),
  notes: z.string().max(4000).default(""),
  /**
   * Zorunlu sürüm: politika `notify` olsa bile ekranda kırmızı çıkar. Güvenlik
   * yaması ile özellik sürümünü ayırmanın tek yolu bu — "sonra bakarım"
   * denebilecek şey ile denemeyecek şey aynı renkte görünmemeli.
   */
  mandatory: z.boolean().default(false),
});
export type AvailableRelease = z.infer<typeof availableReleaseSchema>;

export const updateStateSchema = z.object({
  schema: z.literal(1),
  /** Ajanın akışa en son ne zaman baktığı. */
  checkedAt: isoDate,
  channel: z.string().min(1).max(50),
  policy: z.enum(["off", "notify", "auto"]),
  /** `/api/health`'ten okunan çalışan sürüm. */
  currentVersion: z.string().max(100).default("unknown"),
  available: availableReleaseSchema.nullable().default(null),
  lastRun: updateRunSchema.nullable().default(null),
  /** Akış okunamadıysa sebebi; okunduysa null. */
  error: z.string().max(500).nullable().default(null),
});
export type UpdateState = z.infer<typeof updateStateSchema>;

/**
 * Ajanın durum dosyası. Yolu verilmemişse **özellik kapalıdır** — varsayılan
 * bir yol uydurmak, ajan hiç kurulmamışken "hiç kontrol edilmedi" yerine
 * "dosya yok" hatası üretirdi; ikisi farklı sorular.
 */
export function updateStateFile(): string | null {
  const raw = process.env.UPDATE_STATE_FILE?.trim();
  return raw ? path.resolve(raw) : null;
}

/**
 * Ajanın durumu ekranda nasıl okunacak.
 *
 * `stale` ayrı bir durum ve en önemlisi: ajan ölmüşse dosya son baktığı anı
 * anlatmaya devam eder. "Sürümünüz güncel" yazısı, üç haftadır akışa hiç
 * bakmamış bir kurulumda **yanlış**tır; sessizce güncel göstermektense ajanın
 * susduğunu söylemek gerekiyor.
 */
export type UpdateStatus =
  | "disabled" // UPDATE_STATE_FILE yok — ajan kurulmamış
  | "unknown" // dosya yok ya da okunamıyor
  | "stale" // ajan bir gündür bakmadı
  | "error" // ajan baktı, akışı alamadı
  | "current"
  | "available"
  | "failed"; // son güncelleme denemesi düştü

/** Ajanı ölmüş sayma eşiği. Ajan günde en az bir kez koşacak şekilde kurulur. */
export const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function updateStatus(state: UpdateState | null, now = new Date()): UpdateStatus {
  if (!state) return updateStateFile() ? "unknown" : "disabled";

  const age = now.getTime() - new Date(state.checkedAt).getTime();
  if (age > STALE_AFTER_MS) return "stale";

  // Düşen güncelleme, bekleyen güncellemeden önce gelir: aynı sürüm hâlâ
  // "hazır" görünüyor olacak ve operatör tekrar denemeden önce neden
  // düştüğünü görmeli.
  if (state.lastRun?.result === "failed") return "failed";
  if (state.error) return "error";
  if (state.available && state.available.version !== state.currentVersion) return "available";
  return "current";
}

/**
 * Durum dosyasını oku. Dosya yoksa, bozuksa ya da şeması tutmuyorsa `null` —
 * ekran bunu "bilinmiyor" olarak gösterir. Atma yok: sürüm ekranının kendisi,
 * bir sürüm dosyası bozuk diye 500 vermemeli.
 */
export async function readUpdateState(): Promise<UpdateState | null> {
  const file = updateStateFile();
  if (!file) return null;

  try {
    const raw = await readFile(file, "utf8");
    const parsed = updateStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
