import { prisma } from "@repo/database";
import { purgeAuditLogs, DEFAULT_RETENTION_DAYS } from "./audit-retention";
import { syncTcmbRates } from "./exchange-rate-tcmb";
import { listOrphanMedia, deleteMedia } from "./media";
import { purgePasswordResetTokens } from "./password-reset";
import { deliverDueReports } from "./report-delivery";

// ─────────────────────────────────────────────
// İŞ KAYIT DEFTERİ
// ─────────────────────────────────────────────
//
// Periyodik olması gereken ama kimsenin hatırlamasına bırakılmış işler burada.
// Kayıt defteri deseni bu depoda tanıdık (rapor veri kümeleri, kampanya
// kuralları, ödeme sağlayıcıları): iş **veri**, zamanlayıcı yalnızca çalıştıran.
//
// Her işin tek bir sözü var: **yeniden çalıştırılabilir olmak.** Zamanlayıcı
// çökme, yeniden başlatma ve elle tetikleme yüzünden aynı işi iki kez
// çalıştırabilir; iki kez silmek bir kez silmekle aynı sonucu vermeli.

export interface JobResult {
  /** Ekranda ve günlükte görünen tek satır. */
  summary: string;
  meta?: Record<string, unknown>;
}

export interface JobDefinition {
  name: string;
  label: string;
  description: string;
  /** Varsayılan periyot; kurulum sonrası veritabanından değiştirilebilir. */
  intervalMinutes: number;
  run: () => Promise<JobResult>;
}

const DAY = 24 * 60;

/**
 * Süresi dolmuş şifre sıfırlama biletleri.
 *
 * Bilet tek kullanımlık ve zaten süresi geçmişse işe yaramıyor; tabloda
 * kalması yalnızca büyüme. Silinmesi güvenlik değil, temizlik.
 */
const purgeTokens: JobDefinition = {
  name: "password-reset-purge",
  label: "Şifre biletlerini temizle",
  description: "Süresi geçmiş ve kullanılmış sıfırlama biletlerini siler.",
  intervalMinutes: DAY,
  run: async () => {
    const count = await purgePasswordResetTokens();
    return { summary: `${count} bilet silindi`, meta: { count } };
  },
};

/**
 * Denetim kaydı saklama süresi.
 *
 * Güvenlik olayları listeden muaf: iki yıl önceki başarısız giriş, iki yıl
 * önceki profil düzenlemesinden daha değerli ve hacmi çok daha düşük.
 */
const auditRetention: JobDefinition = {
  name: "audit-retention",
  label: "Denetim kaydını buda",
  description: `${DEFAULT_RETENTION_DAYS} günden eski kayıtları siler; güvenlik olayları saklanır.`,
  intervalMinutes: DAY,
  run: async () => {
    const before = new Date(Date.now() - DEFAULT_RETENTION_DAYS * 86_400_000);
    const result = await purgeAuditLogs({
      before,
      keepActions: ["LOGIN_FAILED", "LOGIN_LOCKED", "ACCESS_DENIED"],
      // İşi bir insan tetiklemedi; kayıt "sistem" adına yazılıyor ki denetim
      // kaydındaki silme satırı sahipsiz görünmesin.
      actor: { id: null, email: "system", role: null },
    });
    return {
      summary: `${result.deleted} denetim kaydı silindi`,
      meta: { deleted: result.deleted, oldestRemaining: result.oldestRemaining },
    };
  },
};

/**
 * Yetim görseller.
 *
 * Üründen kaldırılan görselin dosyası diskte kalıyordu. Silme **iki kez**
 * doğrulanıyor: dosya hiçbir ürünün `images` dizisinde geçmiyor olmalı ve
 * belirli bir yaştan eski olmalı. Yaş koşulu, yükleme ile ürüne bağlanma
 * arasındaki birkaç saniyede dosyanın silinmesini engelliyor.
 */
const orphanMedia: JobDefinition = {
  name: "orphan-media-cleanup",
  label: "Yetim görselleri sil",
  description: "Hiçbir ürüne bağlı olmayan ve 24 saatten eski dosyaları siler.",
  intervalMinutes: DAY,
  run: async () => {
    const orphans = await listOrphanMedia(24);
    let deleted = 0;
    for (const url of orphans) {
      if (await deleteMedia(url)) deleted += 1;
    }
    return { summary: `${deleted} yetim görsel silindi`, meta: { deleted } };
  },
};

/**
 * Terk edilmiş sepetler.
 *
 * Sepet sunucuda duruyor ve fiyat firmaya göre çözülüyor; aylar önce bırakılmış
 * bir sepet bugün açıldığında bambaşka fiyatlarla doluyor. Silmek, müşteriye
 * eskimiş bir sepeti "kaldığın yerden devam et" diye sunmaktan iyi.
 */
const staleCarts: JobDefinition = {
  name: "stale-cart-cleanup",
  label: "Eski sepetleri temizle",
  description: "60 gündür dokunulmamış sepetleri siler.",
  intervalMinutes: DAY,
  run: async () => {
    const cutoff = new Date(Date.now() - 60 * 86_400_000);
    const { count } = await prisma.cart.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
    return { summary: `${count} sepet silindi`, meta: { count } };
  },
};

/**
 * Zamanlanmış rapor gönderimi.
 *
 * On beş dakikada bir soruyor: vakti gelen rapor var mı? Periyodun kısa olması
 * raporların sık gitmesi değil — her raporun kendi periyodu var; bu yalnızca
 * "saat 08:00'de istenen rapor en geç 08:15'te gider" demek.
 *
 * Gönderimin kendisi rapor başına sahipleniliyor, bu iş yalnızca turu açıyor:
 * iki kopya aynı anda çalışsa bile bir rapor bir kez gider.
 */
const reportDelivery: JobDefinition = {
  name: "scheduled-report-delivery",
  label: "Zamanlanmış raporları gönder",
  description: "Vakti gelen kayıtlı raporları çalıştırıp e-posta ile yollar.",
  intervalMinutes: 15,
  run: async () => {
    const outcomes = await deliverDueReports();
    const failed = outcomes.filter((o) => !o.ok);
    return {
      summary:
        outcomes.length === 0
          ? "Vakti gelen rapor yok"
          : `${outcomes.length} rapor işlendi, ${failed.length} hata`,
      meta: { outcomes },
    };
  },
};

/**
 * TCMB günlük kur bülteni.
 *
 * Kuru girmeyi unutmak, dövizli ürünlerin satılamaması demekti — sabah dokuzda
 * fark edilen türden bir aksama. Saatte bir deneniyor: bülten öğleden sonra
 * yayımlanıyor ve tek bir denemenin ağ hatasına denk gelmesi, o günü kursuz
 * bırakırdı.
 *
 * Elle giriş kaldırılmadı: sabit kur ya da banka kuru kullanan satıcı için son
 * yazılan satır geçerli olmaya devam ediyor.
 */
const tcmbRates: JobDefinition = {
  name: "tcmb-exchange-rates",
  label: "TCMB kurlarını çek",
  description: "Merkez Bankası günlük bülteninden döviz satış kurlarını yazar.",
  intervalMinutes: 60,
  run: async () => {
    const result = await syncTcmbRates();
    return {
      summary: `${result.written} kur yazıldı (${result.currencies.join(", ")})`,
      meta: {
        validFrom: result.validFrom.toISOString(),
        currencies: result.currencies,
      },
    };
  },
};

export const JOBS: readonly JobDefinition[] = [
  purgeTokens,
  auditRetention,
  orphanMedia,
  staleCarts,
  reportDelivery,
  tcmbRates,
];

export function findJob(name: string): JobDefinition | undefined {
  return JOBS.find((j) => j.name === name);
}
