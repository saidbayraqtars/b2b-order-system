// Yönetici panosunun **istemciye geçen** parçaları: segment adları ve etiketler.
//
// `@repo/types`ta duruyor, `@repo/services`te değil, ve sebebi derlemeden çıktı:
// servis paketi nodemailer ve `fs` taşıyor. Bir istemci bileşeni oradan bir
// *değer* (tip değil) içe aktardığı anda ikisi de tarayıcı paketine giriyor ve
// derleme "Can't resolve 'fs'" ile düşüyor. Tipler `import type` ile
// silindiği için sorun çıkarmıyor; etiket haritası bir değer.

export const RFM_SEGMENTS = [
  "sampiyon",
  "sadik",
  "riskli",
  "uykuda",
  "kayip",
] as const;

export type RfmSegment = (typeof RFM_SEGMENTS)[number];

export const RFM_SEGMENT_LABELS: Record<RfmSegment, string> = {
  sampiyon: "Şampiyon",
  sadik: "Sadık",
  riskli: "Riskli",
  uykuda: "Uykuda",
  kayip: "Kayıp",
};

/** Panonun bölümleri; adres çubuğunda okunan değer de bu. */
export const ANALYTICS_SECTIONS = [
  "durum",
  "buyume",
  "musteri",
  "urun",
  "karlilik",
  "nakit",
  "gidisat",
] as const;

export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number];

export const ANALYTICS_SECTION_LABELS: Record<AnalyticsSection, string> = {
  durum: "Anlık durum",
  buyume: "Büyüme",
  musteri: "Müşteri",
  urun: "Ürün & stok",
  karlilik: "Kârlılık",
  nakit: "Nakit & alacak",
  gidisat: "Gidişat",
};

// ─────────────────────────────────────────────
// Pencereler — kohort ve RFM (KALAN-ISLER §6.4)
// ─────────────────────────────────────────────
//
// İkisi de sabitti: kohort 12 ay, RFM 365 gün. Sabit olmaları bir kusurdu —
// "son çeyrekte kim uykuya daldı" sorusu 365 günlük pencereden görünmüyor,
// çünkü on ay önce sık alan bir firma hâlâ "sadık" çıkıyor. Artık ekranın
// süzgeci; seçenekler burada, çünkü hem sunucu hem istemci aynı listeyi
// doğruluyor.
//
// Seçenekler **kapalı liste**: serbest sayı olsaydı ekran her tuş vuruşunda
// bir ağır sorgu tetiklerdi. Varsayılan eski sabitin aynısı, ve gecelik özet
// yalnızca varsayılanı hesaplıyor (bkz. analytics.ts `computeCustomers`).

export const RFM_WINDOW_OPTIONS = [90, 180, 365] as const;
export type RfmWindowDays = (typeof RFM_WINDOW_OPTIONS)[number];
export const RFM_WINDOW_DEFAULT: RfmWindowDays = 365;

export const RFM_WINDOW_LABELS: Record<RfmWindowDays, string> = {
  90: "Son 90 gün",
  180: "Son 180 gün",
  365: "Son 1 yıl",
};

export const COHORT_WINDOW_OPTIONS = [6, 12, 24] as const;
export type CohortWindowMonths = (typeof COHORT_WINDOW_OPTIONS)[number];
export const COHORT_WINDOW_DEFAULT: CohortWindowMonths = 12;

export const COHORT_WINDOW_LABELS: Record<CohortWindowMonths, string> = {
  6: "Son 6 ay",
  12: "Son 12 ay",
  24: "Son 24 ay",
};

/** Adres çubuğundan gelen ham değeri seçeneğe oturtuyor; tanımsızsa varsayılan. */
export function parseRfmWindow(raw: string | null | undefined): RfmWindowDays {
  const n = Number(raw);
  return (RFM_WINDOW_OPTIONS as readonly number[]).includes(n)
    ? (n as RfmWindowDays)
    : RFM_WINDOW_DEFAULT;
}

export function parseCohortWindow(raw: string | null | undefined): CohortWindowMonths {
  const n = Number(raw);
  return (COHORT_WINDOW_OPTIONS as readonly number[]).includes(n)
    ? (n as CohortWindowMonths)
    : COHORT_WINDOW_DEFAULT;
}
