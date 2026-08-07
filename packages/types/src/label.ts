import { z } from "zod";
import { LabelTemplateKindEnum } from "./enums";

// ─────────────────────────────────────────────
// ETİKET / FİŞ ŞABLONU
// ─────────────────────────────────────────────
//
// Tasarım, mutlak koordinatlı kutular değil **satır listesi**. Sebebi termal
// yazıcının kendisi: 80 mm'lik bir rulo satır satır basar, yüksekliği içerik
// belirler ve aynı mutlak konum iki farklı yazıcıda iki farklı yere düşer.
// Satır listesi hem tasarımcıda kolay düzenlenir hem de kâğıtta öngörülebilir.
//
// Alanlar `{{...}}` işaretiyle yazılır. Basım anında `renderLabel` doldurur;
// tanımadığı işareti boş basar, hata vermez — yarım fiş, hiç fişten kötüdür.

export const labelBlockKindEnum = z.enum([
  "text", // düz metin / alan
  "divider", // kesikli ayraç çizgisi
  "spacer", // boş satır
  "barcode", // Code128 (sipariş no, sevkiyat no)
  "qr", // QR (belge bağlantısı)
  "items", // sipariş kalemleri tablosu
  "totals", // ara toplam / KDV / genel toplam
  "signature", // imza satırı ("Teslim alan: ……")
]);
export type LabelBlockKind = z.infer<typeof labelBlockKindEnum>;

export const LABEL_BLOCK_LABELS: Record<LabelBlockKind, string> = {
  text: "Metin",
  divider: "Ayraç",
  spacer: "Boşluk",
  barcode: "Barkod",
  qr: "Karekod",
  items: "Kalem tablosu",
  totals: "Toplamlar",
  signature: "İmza satırı",
};

export const labelBlockSchema = z.object({
  kind: labelBlockKindEnum,
  /**
   * Metin/barkod/karekod içeriği. `{{siparis.no}}` gibi işaretler içerebilir.
   * Diğer türlerde yok sayılır.
   */
  value: z.string().max(400).optional(),
  align: z.enum(["left", "center", "right"]).default("left"),
  /** 1 = normal, 2 = iki kat büyük. Termal yazıcıların anladığı ölçek. */
  scale: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  bold: z.boolean().default(false),
});
export type LabelBlock = z.infer<typeof labelBlockSchema>;

export const labelTemplateSchema = z.object({
  kind: LabelTemplateKindEnum,
  name: z.string().trim().min(1).max(120),
  widthMm: z.number().int().min(40).max(300),
  /** Null = rulo: içerik kadar uzar. */
  heightMm: z.number().int().min(20).max(400).nullable().optional(),
  blocks: z.array(labelBlockSchema).min(1).max(60),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type LabelTemplateInput = z.infer<typeof labelTemplateSchema>;

export const updateLabelTemplateSchema = labelTemplateSchema
  .partial()
  .omit({ kind: true })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateLabelTemplateInput = z.infer<typeof updateLabelTemplateSchema>;

/**
 * Kutudan çıkan hazır tasarımlar.
 *
 * Kurulumda veritabanına yazılıyor **ve** hiç şablon tanımlanmamış bir
 * kurulumda yedek olarak kullanılıyor: şablon yokluğu yüzünden fiş
 * basılamaması kabul edilebilir değil. Tasarımcı da "hazırdan başla" derken
 * buradan kopyalıyor — üç yerde üç ayrı "varsayılan tasarım" olmasın diye.
 */
export const DEFAULT_LABEL_TEMPLATES: ReadonlyArray<LabelTemplateInput> = [
  {
    kind: "CARGO_LABEL",
    name: "Standart kargo etiketi (100 mm)",
    widthMm: 100,
    heightMm: 100,
    isDefault: true,
    blocks: [
      { kind: "text", value: "{{satici.ad}}", align: "left", scale: 1, bold: true },
      { kind: "divider", align: "left", scale: 1, bold: false },
      { kind: "text", value: "ALICI", align: "left", scale: 1, bold: true },
      { kind: "text", value: "{{firma.ad}}", align: "left", scale: 2, bold: true },
      { kind: "text", value: "{{adres.satir}}", align: "left", scale: 1, bold: false },
      { kind: "text", value: "{{adres.ilce}} / {{adres.sehir}}", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Tel: {{firma.telefon}}", align: "left", scale: 1, bold: false },
      { kind: "divider", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Sipariş: {{siparis.no}}   Koli: {{sevkiyat.koli}}", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Kargo: {{sevkiyat.kargo}}", align: "left", scale: 1, bold: false },
      { kind: "barcode", value: "{{siparis.no}}", align: "center", scale: 1, bold: false },
    ],
  },
  {
    kind: "ORDER_RECEIPT",
    name: "Sipariş fişi (80 mm)",
    widthMm: 80,
    heightMm: null,
    isDefault: true,
    blocks: [
      { kind: "text", value: "{{satici.ad}}", align: "center", scale: 1, bold: true },
      { kind: "text", value: "SİPARİŞ FİŞİ", align: "center", scale: 2, bold: true },
      { kind: "divider", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Sipariş no: {{siparis.no}}", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Tarih: {{siparis.tarih}}", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Müşteri: {{firma.ad}}", align: "left", scale: 1, bold: true },
      { kind: "text", value: "Temsilci: {{temsilci.ad}}", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Ödeme: {{siparis.odeme}} · {{siparis.vade}}", align: "left", scale: 1, bold: false },
      { kind: "divider", align: "left", scale: 1, bold: false },
      { kind: "items", align: "left", scale: 1, bold: false },
      { kind: "divider", align: "left", scale: 1, bold: false },
      { kind: "totals", align: "right", scale: 1, bold: false },
      { kind: "spacer", align: "left", scale: 1, bold: false },
      { kind: "text", value: "{{siparis.not}}", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Teşekkür ederiz.", align: "center", scale: 1, bold: false },
    ],
  },
  {
    kind: "DELIVERY_RECEIPT",
    name: "Teslim fişi (80 mm)",
    widthMm: 80,
    heightMm: null,
    isDefault: true,
    blocks: [
      { kind: "text", value: "{{satici.ad}}", align: "center", scale: 1, bold: true },
      { kind: "text", value: "TESLİM FİŞİ", align: "center", scale: 2, bold: true },
      { kind: "divider", align: "left", scale: 1, bold: false },
      { kind: "text", value: "İrsaliye: {{sevkiyat.no}}", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Sipariş: {{siparis.no}}", align: "left", scale: 1, bold: false },
      { kind: "text", value: "Müşteri: {{firma.ad}}", align: "left", scale: 1, bold: true },
      { kind: "text", value: "{{adres.satir}}", align: "left", scale: 1, bold: false },
      { kind: "divider", align: "left", scale: 1, bold: false },
      { kind: "items", align: "left", scale: 1, bold: false },
      { kind: "divider", align: "left", scale: 1, bold: false },
      { kind: "totals", align: "right", scale: 1, bold: false },
      { kind: "text", value: "Kurye: {{kurye.ad}}", align: "left", scale: 1, bold: false },
      { kind: "spacer", align: "left", scale: 1, bold: false },
      { kind: "signature", value: "Teslim alan", align: "left", scale: 1, bold: false },
    ],
  },
];

/**
 * Tasarımcıda listelenen doldurulabilir alanlar.
 *
 * Türe göre ayrılmış: kargo etiketinde "teslim alan" diye bir alan yok, teslim
 * fişinde kargo firması yok. Tasarımcı yalnızca o türde dolacak alanları
 * göstersin diye burada duruyor — aksi hâlde kullanıcı hiç dolmayacak bir alanı
 * seçer ve boş basılan fişin nedenini arardı.
 */
export const LABEL_FIELDS: Record<
  z.infer<typeof LabelTemplateKindEnum>,
  ReadonlyArray<{ token: string; label: string }>
> = {
  CARGO_LABEL: [
    { token: "{{siparis.no}}", label: "Sipariş no" },
    { token: "{{sevkiyat.no}}", label: "İrsaliye no" },
    { token: "{{firma.ad}}", label: "Alıcı firma" },
    { token: "{{adres.satir}}", label: "Adres" },
    { token: "{{adres.ilce}}", label: "İlçe" },
    { token: "{{adres.sehir}}", label: "Şehir" },
    { token: "{{firma.telefon}}", label: "Telefon" },
    { token: "{{sevkiyat.kargo}}", label: "Kargo firması" },
    { token: "{{sevkiyat.takipno}}", label: "Takip no" },
    { token: "{{sevkiyat.koli}}", label: "Koli sayısı" },
    { token: "{{satici.ad}}", label: "Gönderen firma" },
    { token: "{{tarih}}", label: "Tarih" },
  ],
  ORDER_RECEIPT: [
    { token: "{{siparis.no}}", label: "Sipariş no" },
    { token: "{{siparis.tarih}}", label: "Sipariş tarihi" },
    { token: "{{firma.ad}}", label: "Müşteri" },
    { token: "{{temsilci.ad}}", label: "Temsilci" },
    { token: "{{siparis.odeme}}", label: "Ödeme yöntemi" },
    { token: "{{siparis.vade}}", label: "Vade" },
    { token: "{{siparis.aratoplam}}", label: "Ara toplam" },
    { token: "{{siparis.kdv}}", label: "KDV" },
    { token: "{{siparis.toplam}}", label: "Genel toplam" },
    { token: "{{siparis.not}}", label: "Sipariş notu" },
    { token: "{{satici.ad}}", label: "Satıcı firma" },
    { token: "{{tarih}}", label: "Basım tarihi" },
  ],
  DELIVERY_RECEIPT: [
    { token: "{{siparis.no}}", label: "Sipariş no" },
    { token: "{{sevkiyat.no}}", label: "İrsaliye no" },
    { token: "{{firma.ad}}", label: "Müşteri" },
    { token: "{{adres.satir}}", label: "Teslim adresi" },
    { token: "{{kurye.ad}}", label: "Kurye" },
    { token: "{{teslim.alan}}", label: "Teslim alan" },
    { token: "{{teslim.tarih}}", label: "Teslim tarihi" },
    { token: "{{siparis.toplam}}", label: "Genel toplam" },
    { token: "{{satici.ad}}", label: "Satıcı firma" },
    { token: "{{tarih}}", label: "Basım tarihi" },
  ],
};
