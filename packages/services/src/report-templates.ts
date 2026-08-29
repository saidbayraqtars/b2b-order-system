import { prisma } from "@repo/database";
import type { CreateReportDefinitionInput, ReportDataset } from "@repo/types";
import { createReportDefinition } from "./report-definition";
import { BusinessError } from "./errors";
import type { ReportContext } from "./report-registry";

// Hazır rapor şablonları.
//
// Rapor tasarımcısı boş bir tuvalle açılıyordu ve boş tuval, kurulumun ilk
// gününde en pahalı ekran: dokuz veri kümesi, yüzlerce alan, ve "neyi
// sorabileceğimi bilmiyorum" diyen bir kullanıcı. Şablonlar o boşluğu
// dolduruyor — her biri **tam bir rapor tanımı**, tek tıkla kullanıcının
// kendi raporuna kopyalanıyor ve oradan serbestçe değiştiriliyor.
//
// Üç karar:
//
//  1. **Kopya, bağlantı değil.** Şablon kurulduktan sonra kaydın şablonla
//     ilişkisi kalmıyor. Bağlantı olsaydı yeni sürüm kullanıcının elle
//     değiştirdiği raporu geri alırdı; şablon bir başlangıç noktası, bir
//     abonelik değil.
//  2. **Kayıt defteri yine tek yetkili.** Şablonun tanımı da `normalizeConfig`
//     üstünden geçiyor: kodda yazılı olması onu güvenli yapmıyor, alan adı
//     yanlışsa kurulum anında patlaması gerekiyor. Testi bunu her şablon için
//     ayrı ayrı sınıyor.
//  3. **Kapsam kurulanın.** Rapor kimin adına kurulduysa onun satır kapsamıyla
//     çalışıyor; plasiyerin kurduğu "firma bakiyeleri" raporu yalnızca kendi
//     portföyünü gösteriyor. Şablonda ayrıcalık yok.

export type ReportTemplateCategory =
  | "Satış"
  | "Kârlılık"
  | "Tahsilat"
  | "Stok"
  | "Saha"
  | "Kampanya";

export interface ReportTemplate {
  /** Kararlı kimlik — ekranın kurulum çağrısında gönderdiği değer. */
  key: string;
  name: string;
  description: string;
  category: ReportTemplateCategory;
  dataset: ReportDataset;
  /** "Bu rapor hangi soruyu cevaplıyor" — kartın altındaki cümle. */
  question: string;
  config: CreateReportDefinitionInput["config"];
}

/** Ciro tanımı her yerde aynı: iptal ve red sayılmaz. */
const LIVE_ORDERS = {
  field: "status",
  operator: "notIn" as const,
  value: ["CANCELLED", "REJECTED", "DRAFT"],
};

const LIVE_ORDER_ITEMS = {
  field: "orderStatus",
  operator: "notIn" as const,
  value: ["CANCELLED", "REJECTED", "DRAFT"],
};

export const REPORT_TEMPLATES: readonly ReportTemplate[] = [
  // ── satış ─────────────────────────────────────────────────────────────
  {
    key: "aylik-ciro",
    name: "Aylık ciro",
    description: "Ay ay net ciro ve sipariş adedi",
    category: "Satış",
    dataset: "ORDERS",
    question: "Aylar arasında ne oldu?",
    config: {
      columns: [
        { field: "createdAt_month", label: "Ay" },
        { field: "grandTotal", aggregate: "SUM", label: "Ciro", format: "money" },
        { field: "orderNumber", aggregate: "COUNT", label: "Sipariş", format: "number" },
      ],
      computed: [],
      filters: [LIVE_ORDERS],
      groupBy: ["createdAt_month"],
      sort: [{ field: "createdAt_month", direction: "asc" }],
      chart: { type: "bar", categoryField: "createdAt_month", valueField: "grandTotal__sum" },
    },
  },
  {
    key: "firma-ciro",
    name: "Firma bazında ciro",
    description: "En çok alan 20 firma, ortalama sepetiyle",
    category: "Satış",
    dataset: "ORDERS",
    question: "Kim ne kadar alıyor, tek seferde ne kadar?",
    config: {
      columns: [
        { field: "companyName", label: "Firma", width: 240 },
        { field: "grandTotal", aggregate: "SUM", label: "Ciro", format: "money" },
        { field: "orderNumber", aggregate: "COUNT", label: "Sipariş", format: "number" },
      ],
      // Bölme sonucun üstünde: SQL'de yapılsaydı ortalama, ortalamaların
      // ortalaması olurdu.
      computed: [
        {
          key: "ortalamaSepet",
          label: "Ortalama sepet",
          expression: "grandTotal__sum / orderNumber__count",
          format: "money",
        },
      ],
      filters: [LIVE_ORDERS],
      groupBy: ["companyName"],
      sort: [{ field: "grandTotal__sum", direction: "desc" }],
      limit: 20,
      chart: { type: "table" },
    },
  },
  {
    key: "en-cok-satan-urun",
    name: "En çok satan ürünler",
    description: "Adet ve tutarla, ilk 30 ürün",
    category: "Satış",
    dataset: "ORDER_ITEMS",
    question: "Hangi ürün taşıyor?",
    config: {
      columns: [
        { field: "productName", label: "Ürün", width: 260 },
        { field: "quantity", aggregate: "SUM", label: "Adet", format: "number" },
        { field: "lineTotal", aggregate: "SUM", label: "Tutar", format: "money" },
      ],
      computed: [],
      filters: [LIVE_ORDER_ITEMS],
      groupBy: ["productName"],
      sort: [{ field: "lineTotal__sum", direction: "desc" }],
      limit: 30,
      chart: { type: "table" },
    },
  },
  {
    key: "kategori-kirilimi",
    name: "Kategori kırılımı",
    description: "Satılan malın kategorilere dağılımı",
    category: "Satış",
    dataset: "ORDER_ITEMS",
    question: "Ciro hangi raftan geliyor?",
    config: {
      columns: [
        { field: "categoryName", label: "Kategori" },
        { field: "lineTotal", aggregate: "SUM", label: "Tutar", format: "money" },
        { field: "quantity", aggregate: "SUM", label: "Adet", format: "number" },
      ],
      computed: [],
      filters: [LIVE_ORDER_ITEMS],
      groupBy: ["categoryName"],
      sort: [{ field: "lineTotal__sum", direction: "desc" }],
      limit: 10,
      chart: { type: "pie", categoryField: "categoryName", valueField: "lineTotal__sum" },
    },
  },
  {
    key: "marka-kirilimi",
    name: "Marka kırılımı",
    description: "Hangi markanın ne kadar döndüğü",
    category: "Satış",
    dataset: "ORDER_ITEMS",
    question: "Tedarikçi görüşmesine hangi rakamla gidilecek?",
    config: {
      columns: [
        { field: "brand", label: "Marka" },
        { field: "lineTotal", aggregate: "SUM", label: "Tutar", format: "money" },
        { field: "quantity", aggregate: "SUM", label: "Adet", format: "number" },
      ],
      computed: [],
      filters: [LIVE_ORDER_ITEMS],
      groupBy: ["brand"],
      sort: [{ field: "lineTotal__sum", direction: "desc" }],
      limit: 20,
      chart: { type: "bar", categoryField: "brand", valueField: "lineTotal__sum" },
    },
  },
  {
    key: "plasiyer-ciro-90",
    name: "Plasiyer cirosu (90 gün)",
    description: "Son 90 günün cirosu, portföy sahibine göre",
    category: "Satış",
    dataset: "ORDERS",
    question: "Saha ekibi bu çeyrekte ne getirdi?",
    config: {
      columns: [
        { field: "salesRepName", label: "Plasiyer" },
        { field: "grandTotal", aggregate: "SUM", label: "Ciro", format: "money" },
        { field: "orderNumber", aggregate: "COUNT", label: "Sipariş", format: "number" },
      ],
      computed: [],
      // Kayan pencere: kaydedilen rapor tarih donduğu anda bayatlar.
      filters: [LIVE_ORDERS, { field: "createdAt", operator: "lastNDays", value: 90 }],
      groupBy: ["salesRepName"],
      sort: [{ field: "grandTotal__sum", direction: "desc" }],
      chart: { type: "bar", categoryField: "salesRepName", valueField: "grandTotal__sum" },
    },
  },
  {
    key: "sehir-dagilimi",
    name: "Şehir bazında satış",
    description: "Sevk adresine göre ciro dağılımı",
    category: "Satış",
    dataset: "ORDERS",
    question: "Hangi bölge büyüyor, hangisi duruyor?",
    config: {
      columns: [
        { field: "city", label: "Şehir" },
        { field: "grandTotal", aggregate: "SUM", label: "Ciro", format: "money" },
        { field: "companyName", aggregate: "COUNT_DISTINCT", label: "Firma", format: "number" },
      ],
      computed: [],
      filters: [LIVE_ORDERS],
      groupBy: ["city"],
      sort: [{ field: "grandTotal__sum", direction: "desc" }],
      limit: 25,
      chart: { type: "bar", categoryField: "city", valueField: "grandTotal__sum" },
    },
  },
  {
    key: "siparis-kanali",
    name: "Sipariş kanalı",
    description: "Web, mobil, saha ve panelden gelen siparişlerin payı",
    category: "Satış",
    dataset: "ORDERS",
    question: "Bayi kendi mi giriyor, plasiyer mi giriyor?",
    config: {
      columns: [
        { field: "source", label: "Kanal" },
        { field: "orderNumber", aggregate: "COUNT", label: "Sipariş", format: "number" },
        { field: "grandTotal", aggregate: "SUM", label: "Ciro", format: "money" },
      ],
      computed: [],
      filters: [LIVE_ORDERS],
      groupBy: ["source"],
      sort: [{ field: "grandTotal__sum", direction: "desc" }],
      chart: { type: "pie", categoryField: "source", valueField: "grandTotal__sum" },
    },
  },
  {
    key: "iptal-red",
    name: "İptal ve red edilenler",
    description: "Kaybedilen siparişler, firma ve tutarla",
    category: "Satış",
    dataset: "ORDERS",
    question: "Ne kaçtı, kimden kaçtı?",
    config: {
      columns: [
        { field: "orderNumber", label: "Sipariş" },
        { field: "createdAt", label: "Tarih", format: "date" },
        { field: "companyName", label: "Firma", width: 220 },
        { field: "status", label: "Durum" },
        { field: "grandTotal", label: "Tutar", format: "money" },
      ],
      computed: [],
      filters: [{ field: "status", operator: "in", value: ["CANCELLED", "REJECTED"] }],
      groupBy: [],
      sort: [{ field: "createdAt", direction: "desc" }],
      limit: 200,
      chart: { type: "table" },
    },
  },

  // ── kârlılık ──────────────────────────────────────────────────────────
  {
    key: "iskonto-dokumu",
    name: "İskonto dökümü",
    description: "Ay ay firma iskontosu, hacim iskontosu ve kampanya",
    category: "Kârlılık",
    dataset: "ORDER_ITEMS",
    question: "Masada ne bıraktık, hangi kaynaktan?",
    config: {
      columns: [
        { field: "order_createdAt_month", label: "Ay" },
        { field: "discount", aggregate: "SUM", label: "Birim iskonto", format: "money" },
        { field: "volumeDiscount", aggregate: "SUM", label: "Hacim (birim)", format: "money" },
        { field: "promotionDiscount", aggregate: "SUM", label: "Kampanya", format: "money" },
        { field: "lineTotal", aggregate: "SUM", label: "Net", format: "money" },
      ],
      computed: [],
      filters: [LIVE_ORDER_ITEMS],
      groupBy: ["order_createdAt_month"],
      sort: [{ field: "order_createdAt_month", direction: "asc" }],
      chart: {
        type: "bar",
        categoryField: "order_createdAt_month",
        valueField: "promotionDiscount__sum",
      },
    },
  },
  {
    key: "bedelsiz-mal",
    name: "Bedelsiz mal",
    description: "Kampanyanın hediye ettiği satırlar",
    category: "Kârlılık",
    dataset: "ORDER_ITEMS",
    question: "Hediye mal kime, ne kadar gitti?",
    config: {
      columns: [
        { field: "companyName", label: "Firma", width: 220 },
        { field: "productName", label: "Ürün", width: 240 },
        { field: "quantity", aggregate: "SUM", label: "Adet", format: "number" },
      ],
      computed: [],
      filters: [LIVE_ORDER_ITEMS, { field: "isGift", operator: "eq", value: true }],
      groupBy: ["companyName", "productName"],
      sort: [{ field: "quantity__sum", direction: "desc" }],
      limit: 100,
      chart: { type: "table" },
    },
  },
  {
    key: "musteri-grubu-fiyat",
    name: "Müşteri grubu kırılımı",
    description: "Hangi fiyat grubunun ne kadar aldığı",
    category: "Kârlılık",
    dataset: "ORDERS",
    question: "Hangi liste gerçekten çalışıyor?",
    config: {
      columns: [
        { field: "customerGroupName", label: "Müşteri grubu" },
        { field: "grandTotal", aggregate: "SUM", label: "Ciro", format: "money" },
        { field: "discountTotal", aggregate: "SUM", label: "İskonto", format: "money" },
        { field: "companyName", aggregate: "COUNT_DISTINCT", label: "Firma", format: "number" },
      ],
      computed: [],
      filters: [LIVE_ORDERS],
      groupBy: ["customerGroupName"],
      sort: [{ field: "grandTotal__sum", direction: "desc" }],
      chart: { type: "table" },
    },
  },

  // ── tahsilat ──────────────────────────────────────────────────────────
  {
    key: "aylik-tahsilat",
    name: "Aylık tahsilat",
    description: "Cari defterin alacak tarafı, ay ay",
    category: "Tahsilat",
    dataset: "LEDGER",
    question: "Para gerçekten geldi mi?",
    config: {
      columns: [
        { field: "createdAt_month", label: "Ay" },
        { field: "amount", aggregate: "SUM", label: "Tahsilat", format: "money" },
      ],
      computed: [],
      filters: [{ field: "type", operator: "eq", value: "CREDIT" }],
      groupBy: ["createdAt_month"],
      sort: [{ field: "createdAt_month", direction: "asc" }],
      chart: { type: "bar", categoryField: "createdAt_month", valueField: "amount__sum" },
    },
  },
  {
    key: "tahsilat-yontemi",
    name: "Tahsilat yöntemi",
    description: "Nakit, havale, çek ve kartın payı",
    category: "Tahsilat",
    dataset: "LEDGER",
    question: "Tahsilat hangi araçla geliyor?",
    config: {
      columns: [
        { field: "paymentMethod", label: "Yöntem" },
        { field: "amount", aggregate: "SUM", label: "Tutar", format: "money" },
      ],
      computed: [],
      filters: [{ field: "type", operator: "eq", value: "CREDIT" }],
      groupBy: ["paymentMethod"],
      sort: [{ field: "amount__sum", direction: "desc" }],
      chart: { type: "pie", categoryField: "paymentMethod", valueField: "amount__sum" },
    },
  },
  {
    key: "firma-bakiye",
    name: "Firma bakiyeleri",
    description: "Aktif firmalar, bakiyesi büyükten küçüğe",
    category: "Tahsilat",
    dataset: "COMPANIES",
    question: "Kimde ne kadar para var?",
    config: {
      columns: [
        { field: "name", label: "Firma", width: 260 },
        { field: "currentBalance", label: "Bakiye", format: "money" },
        { field: "creditLimit", label: "Kredi limiti", format: "money" },
        { field: "paymentTermDays", label: "Vade (gün)", format: "number" },
        { field: "salesRepName", label: "Plasiyer" },
      ],
      computed: [],
      filters: [{ field: "isActive", operator: "eq", value: true }],
      groupBy: [],
      sort: [{ field: "currentBalance", direction: "desc" }],
      limit: 200,
      chart: { type: "table" },
    },
  },
  {
    key: "kasa-gunluk",
    name: "Kasa ve banka hareketi",
    description: "Gün gün giren ve çıkan para, hesap bazında",
    category: "Tahsilat",
    dataset: "CASH",
    question: "Kasadan bugün ne geçti?",
    config: {
      columns: [
        { field: "occurredAt_day", label: "Gün" },
        { field: "accountName", label: "Hesap" },
        { field: "direction", label: "Yön" },
        { field: "amount", aggregate: "SUM", label: "Tutar", format: "money" },
      ],
      computed: [],
      filters: [{ field: "occurredAt", operator: "lastNDays", value: 30 }],
      groupBy: ["occurredAt_day", "accountName", "direction"],
      sort: [{ field: "occurredAt_day", direction: "desc" }],
      limit: 300,
      chart: { type: "table" },
    },
  },

  // ── stok ──────────────────────────────────────────────────────────────
  {
    key: "stok-cikis-urun",
    name: "Ürün bazında stok çıkışı",
    description: "Son 90 günde depodan ne çıktı",
    category: "Stok",
    dataset: "STOCK",
    question: "Hangi mal gerçekten hareket ediyor?",
    config: {
      columns: [
        { field: "productName", label: "Ürün", width: 260 },
        { field: "quantity", aggregate: "SUM", label: "Çıkan adet", format: "number" },
      ],
      computed: [],
      filters: [
        { field: "direction", operator: "eq", value: "OUT" },
        { field: "occurredAt", operator: "lastNDays", value: 90 },
      ],
      groupBy: ["productName"],
      sort: [{ field: "quantity__sum", direction: "desc" }],
      limit: 50,
      chart: { type: "table" },
    },
  },
  {
    key: "depo-hareketi",
    name: "Depo bazında hareket",
    description: "Giriş ve çıkışın depolara dağılımı",
    category: "Stok",
    dataset: "STOCK",
    question: "Hangi depo çalışıyor?",
    config: {
      columns: [
        { field: "warehouseName", label: "Depo" },
        { field: "direction", label: "Yön" },
        { field: "quantity", aggregate: "SUM", label: "Adet", format: "number" },
      ],
      computed: [],
      filters: [{ field: "occurredAt", operator: "lastNDays", value: 90 }],
      groupBy: ["warehouseName", "direction"],
      sort: [{ field: "quantity__sum", direction: "desc" }],
      chart: { type: "table" },
    },
  },
  {
    key: "skt-yaklasan",
    name: "Son kullanma tarihi yaklaşanlar",
    description: "Eldeki partiler, tarihi en yakın olan üstte",
    category: "Stok",
    dataset: "STOCK_LOTS",
    question: "Hangi mal elde kalırsa çöpe gider?",
    config: {
      columns: [
        { field: "expiryDate", label: "SKT", format: "date" },
        { field: "code", label: "Parti" },
        { field: "productName", label: "Ürün", width: 240 },
        { field: "onHand", label: "Eldeki", format: "number" },
        { field: "shelfCode", label: "Raf" },
      ],
      computed: [],
      filters: [
        { field: "onHand", operator: "gt", value: 0 },
        { field: "expiryDate", operator: "notNull" },
      ],
      groupBy: [],
      sort: [{ field: "expiryDate", direction: "asc" }],
      limit: 200,
      chart: { type: "table" },
    },
  },

  // ── saha ──────────────────────────────────────────────────────────────
  {
    key: "ziyaret-plasiyer",
    name: "Plasiyer ziyaret sayısı",
    description: "Son 30 günün ziyaretleri ve ortalama süresi",
    category: "Saha",
    dataset: "CHECKINS",
    question: "Saha gerçekten sahada mı?",
    config: {
      columns: [
        { field: "salesRepName", label: "Plasiyer" },
        { field: "companyName", aggregate: "COUNT", label: "Ziyaret", format: "number" },
        {
          field: "durationMinutes",
          aggregate: "AVG",
          label: "Ortalama süre (dk)",
          format: "number",
        },
      ],
      computed: [],
      filters: [{ field: "checkInAt", operator: "lastNDays", value: 30 }],
      groupBy: ["salesRepName"],
      sort: [{ field: "companyName__count", direction: "desc" }],
      chart: { type: "bar", categoryField: "salesRepName", valueField: "companyName__count" },
    },
  },
  {
    key: "ziyaret-kaynagi",
    name: "Ziyaret kaynağı",
    description: "Mobil uygulamadan mı, elle mi girildi",
    category: "Saha",
    dataset: "CHECKINS",
    question: "Kayıt sahadan mı geliyor, masadan mı?",
    config: {
      columns: [
        { field: "source", label: "Kaynak" },
        { field: "companyName", aggregate: "COUNT", label: "Ziyaret", format: "number" },
      ],
      computed: [],
      filters: [{ field: "checkInAt", operator: "lastNDays", value: 90 }],
      groupBy: ["source"],
      sort: [{ field: "companyName__count", direction: "desc" }],
      chart: { type: "pie", categoryField: "source", valueField: "companyName__count" },
    },
  },

  // ── kampanya ──────────────────────────────────────────────────────────
  {
    key: "kampanya-kullanim",
    name: "Kampanya kullanımları",
    description: "Kampanya başına kaç kez, ne kadar iskonto",
    category: "Kampanya",
    dataset: "PROMOTIONS",
    question: "Hangi kampanya tuttu, kaça mal oldu?",
    config: {
      columns: [
        { field: "promotionName", label: "Kampanya", width: 240 },
        { field: "orderNumber", aggregate: "COUNT", label: "Kullanım", format: "number" },
        { field: "amount", aggregate: "SUM", label: "İskonto", format: "money" },
      ],
      computed: [],
      filters: [
        { field: "orderStatus", operator: "notIn", value: ["CANCELLED", "REJECTED", "DRAFT"] },
      ],
      groupBy: ["promotionName"],
      sort: [{ field: "amount__sum", direction: "desc" }],
      chart: { type: "bar", categoryField: "promotionName", valueField: "amount__sum" },
    },
  },
  {
    key: "kampanya-firma",
    name: "Kampanyadan yararlanan firmalar",
    description: "Kim ne kadar kampanya iskontosu aldı",
    category: "Kampanya",
    dataset: "PROMOTIONS",
    question: "İskonto tabana mı gitti, birkaç firmaya mı?",
    config: {
      columns: [
        { field: "companyName", label: "Firma", width: 240 },
        { field: "amount", aggregate: "SUM", label: "İskonto", format: "money" },
        { field: "orderNumber", aggregate: "COUNT_DISTINCT", label: "Sipariş", format: "number" },
      ],
      computed: [],
      filters: [
        { field: "orderStatus", operator: "notIn", value: ["CANCELLED", "REJECTED", "DRAFT"] },
      ],
      groupBy: ["companyName"],
      sort: [{ field: "amount__sum", direction: "desc" }],
      limit: 50,
      chart: { type: "table" },
    },
  },
];

export const REPORT_TEMPLATE_CATEGORIES: readonly ReportTemplateCategory[] = [
  "Satış",
  "Kârlılık",
  "Tahsilat",
  "Stok",
  "Saha",
  "Kampanya",
];

export function findReportTemplate(key: string): ReportTemplate | null {
  return REPORT_TEMPLATES.find((t) => t.key === key) ?? null;
}

/**
 * Şablonu kullanıcının kendi raporuna kopyalar.
 *
 * Ad çakışırsa sonuna sayı ekleniyor: aynı şablonu ikinci kez kurmak bir hata
 * değil (biri değiştirilmiş, biri temiz istenebilir) ve ikisini aynı adla
 * bırakmak listeyi okunamaz yapardı.
 */
export async function installReportTemplate(
  key: string,
  ctx: ReportContext,
): Promise<{ id: string; name: string }> {
  const template = findReportTemplate(key);
  if (!template) {
    throw new BusinessError("REPORT_NOT_FOUND", "Şablon bulunamadı", { key });
  }

  const name = await uniqueName(template.name, ctx.userId);
  const created = await createReportDefinition(
    {
      name,
      description: template.description,
      dataset: template.dataset,
      isShared: false,
      config: template.config,
    },
    ctx,
  );
  return { id: created.id, name };
}

async function uniqueName(base: string, ownerId: string): Promise<string> {
  const taken = await prisma.reportDefinition.findMany({
    where: { ownerId, name: { startsWith: base } },
    select: { name: true },
  });
  if (!taken.some((t) => t.name === base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base} (${i})`;
    if (!taken.some((t) => t.name === candidate)) return candidate;
  }
  return `${base} (${Date.now()})`;
}
