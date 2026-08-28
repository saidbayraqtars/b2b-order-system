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
  "nakit",
  "gidisat",
] as const;

export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number];

export const ANALYTICS_SECTION_LABELS: Record<AnalyticsSection, string> = {
  durum: "Anlık durum",
  buyume: "Büyüme",
  musteri: "Müşteri",
  urun: "Ürün & stok",
  nakit: "Nakit & alacak",
  gidisat: "Gidişat",
};
