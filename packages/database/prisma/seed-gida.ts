import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Gıda toptancısı gösterim kataloğu.
//
// `seed-demo.ts` genel bir katalog yazar; bu betik onun üstüne **gıdaya özel**
// olanı koyar: parti (lot) takipli kalemler, kasa/kg çift birim, ve son
// kullanma tarihi bilerek üç kümeye dağıtılmış partiler — geçmiş, yaklaşan,
// uygun. Sunumda anlatılan üç şeyin ekranda görünmesi için hepsi gerekli:
//
//   1. Sipariş malı FEFO ile ayırır (SKT'si en yakın parti önce çıkar).
//   2. SKT'si geçmiş mal satılmaz, fire kararı bekler.
//   3. Kasa satılır, kg konuşulur — fiyat çarpanla çevrilir.
//
//   pnpm --filter @repo/database exec tsx prisma/seed-gida.ts
//
// Idempotent: SKU ve slug üzerinden upsert eder, partileri (variantId, code)
// çiftiyle bulur. Tekrar çalıştırmak kayıt kopyalamaz — ama parti bakiyelerini
// hedef adede **çeker**, çünkü gösterimden önce ekranın bilinen bir hâlde
// olması, defterin gösterim sırasında biriktirdiği hareketlerden önemli.

const CATEGORIES = [
  { name: "Süt & Süt Ürünleri", slug: "sut-urunleri" },
  { name: "Bakliyat & Kuru Gıda", slug: "bakliyat" },
  { name: "Konserve & Salça", slug: "konserve" },
  { name: "Yağ & Sirke", slug: "yag-sirke" },
  { name: "İçecek", slug: "icecek" },
  { name: "Şarküteri", slug: "sarkuteri" },
];

interface SeedVariant {
  sku: string;
  barcode?: string;
  /** Satış birimi — müşterinin sipariş verdiği birim. */
  unit: string;
  unitsPerCase: number;
  moqUnits: number;
  /** Fiyat birimi + çarpan: doluysa fiyat kg/lt üzerinden listelenir. */
  pricingUnit?: string;
  unitFactor?: number;
  /** Liste fiyatı — `pricingUnit` doluysa **fiyat birimi** başına. */
  price: number;
  tracksLots: boolean;
  shelfLifeDays?: number;
  expiryWarningDays?: number;
  isVariableWeight?: boolean;
  shelfCode?: string;
  minStock?: number;
  costPrice?: number;
  /** Partiler: SKT'ye kalan gün (eksi = geçmiş) ve adet. */
  lots?: Array<{ code: string; daysToExpiry: number; quantity: number; blocked?: boolean }>;
  /** Partisiz kalemlerde doğrudan stok. */
  stock?: number;
}

interface SeedProduct {
  name: string;
  slug: string;
  brand: string;
  category: string;
  vatRate: number;
  variants: SeedVariant[];
}

const PRODUCTS: SeedProduct[] = [
  {
    name: "Tam Yağlı Beyaz Peynir",
    slug: "tam-yagli-beyaz-peynir",
    brand: "Pınarbaşı",
    category: "sut-urunleri",
    vatRate: 1,
    variants: [
      {
        // Çift birim örneğinin ta kendisi: kasa satılır, kilo konuşulur.
        sku: "GD-PEY-17KG",
        barcode: "8690001000011",
        unit: "KASA",
        unitsPerCase: 1,
        moqUnits: 1,
        pricingUnit: "KG",
        unitFactor: 17,
        price: 214.5,
        costPrice: 168,
        tracksLots: true,
        shelfLifeDays: 120,
        expiryWarningDays: 30,
        isVariableWeight: true,
        shelfCode: "SOG-A1",
        minStock: 10,
        lots: [
          { code: "PB-2609-A", daysToExpiry: 9, quantity: 12 },
          { code: "PB-2612-B", daysToExpiry: 47, quantity: 40 },
          { code: "PB-2604-X", daysToExpiry: -6, quantity: 6 },
        ],
      },
    ],
  },
  {
    name: "Süzme Yoğurt 5 kg",
    slug: "suzme-yogurt-5kg",
    brand: "Pınarbaşı",
    category: "sut-urunleri",
    vatRate: 1,
    variants: [
      {
        sku: "GD-YOG-5KG",
        barcode: "8690001000028",
        unit: "KOVA",
        unitsPerCase: 4,
        moqUnits: 4,
        pricingUnit: "KG",
        unitFactor: 5,
        price: 78.9,
        costPrice: 61,
        tracksLots: true,
        shelfLifeDays: 21,
        expiryWarningDays: 7,
        shelfCode: "SOG-A3",
        minStock: 20,
        lots: [
          { code: "PB-YOG-3105", daysToExpiry: 4, quantity: 24 },
          { code: "PB-YOG-3112", daysToExpiry: 16, quantity: 60 },
        ],
      },
    ],
  },
  {
    name: "UHT Tam Yağlı Süt 1 L",
    slug: "uht-sut-1l",
    brand: "Pınarbaşı",
    category: "sut-urunleri",
    vatRate: 1,
    variants: [
      {
        sku: "GD-SUT-1L",
        barcode: "8690001000035",
        unit: "KOLİ",
        unitsPerCase: 12,
        moqUnits: 12,
        pricingUnit: "LT",
        unitFactor: 12,
        price: 27.4,
        costPrice: 22.1,
        tracksLots: true,
        shelfLifeDays: 180,
        shelfCode: "KR-B2",
        minStock: 40,
        lots: [
          { code: "UHT-260715", daysToExpiry: 132, quantity: 200 },
          { code: "UHT-260602", daysToExpiry: 24, quantity: 48 },
        ],
      },
    ],
  },
  {
    name: "Kaşar Peyniri 1 kg",
    slug: "kasar-peyniri-1kg",
    brand: "Yayla Süt",
    category: "sut-urunleri",
    vatRate: 1,
    variants: [
      {
        sku: "GD-KAS-1KG",
        barcode: "8690001000042",
        unit: "ADET",
        unitsPerCase: 6,
        moqUnits: 6,
        price: 289.0,
        costPrice: 231,
        tracksLots: true,
        shelfLifeDays: 90,
        expiryWarningDays: 21,
        shelfCode: "SOG-B1",
        minStock: 12,
        lots: [
          { code: "YS-K-1187", daysToExpiry: 63, quantity: 36 },
          { code: "YS-K-1102", daysToExpiry: -2, quantity: 8 },
          // Bloke: şüpheli soğuk zincir. FEFO sırasına hiç girmemeli.
          { code: "YS-K-1155", daysToExpiry: 40, quantity: 18, blocked: true },
        ],
      },
    ],
  },
  {
    name: "Pirinç Baldo 25 kg",
    slug: "pirinc-baldo-25kg",
    brand: "Anadolu Tarım",
    category: "bakliyat",
    vatRate: 1,
    variants: [
      {
        sku: "GD-PRC-25KG",
        barcode: "8690002000012",
        unit: "ÇUVAL",
        unitsPerCase: 1,
        moqUnits: 1,
        pricingUnit: "KG",
        unitFactor: 25,
        price: 62.5,
        costPrice: 51,
        tracksLots: true,
        shelfLifeDays: 540,
        shelfCode: "KR-C1",
        minStock: 15,
        lots: [
          { code: "AT-PRC-2601", daysToExpiry: 410, quantity: 60 },
          { code: "AT-PRC-2512", daysToExpiry: 95, quantity: 22 },
        ],
      },
    ],
  },
  {
    name: "Nohut 5 kg",
    slug: "nohut-5kg",
    brand: "Anadolu Tarım",
    category: "bakliyat",
    vatRate: 1,
    variants: [
      {
        sku: "GD-NHT-5KG",
        unit: "PAKET",
        unitsPerCase: 5,
        moqUnits: 5,
        pricingUnit: "KG",
        unitFactor: 5,
        price: 58.0,
        costPrice: 46,
        tracksLots: true,
        shelfLifeDays: 365,
        shelfCode: "KR-C2",
        lots: [{ code: "AT-NHT-2602", daysToExpiry: 300, quantity: 120 }],
      },
    ],
  },
  {
    name: "Domates Salçası 830 g",
    slug: "domates-salcasi-830g",
    brand: "Tadım",
    category: "konserve",
    vatRate: 1,
    variants: [
      {
        sku: "GD-SLC-830",
        barcode: "8690003000019",
        unit: "KOLİ",
        unitsPerCase: 12,
        moqUnits: 12,
        price: 468.0,
        costPrice: 384,
        tracksLots: true,
        shelfLifeDays: 730,
        shelfCode: "KR-D1",
        minStock: 25,
        lots: [
          { code: "TD-SL-2603", daysToExpiry: 620, quantity: 84 },
          { code: "TD-SL-2511", daysToExpiry: 28, quantity: 24 },
        ],
      },
    ],
  },
  {
    name: "Ton Balığı 160 g",
    slug: "ton-baligi-160g",
    brand: "Tadım",
    category: "konserve",
    vatRate: 10,
    variants: [
      {
        sku: "GD-TON-160",
        barcode: "8690003000026",
        unit: "KOLİ",
        unitsPerCase: 24,
        moqUnits: 24,
        price: 1_128.0,
        costPrice: 930,
        tracksLots: true,
        shelfLifeDays: 1095,
        shelfCode: "KR-D2",
        lots: [{ code: "TD-TN-2602", daysToExpiry: 880, quantity: 48 }],
      },
    ],
  },
  {
    name: "Ayçiçek Yağı 5 L",
    slug: "aycicek-yagi-5l",
    brand: "Altınyağ",
    category: "yag-sirke",
    vatRate: 1,
    variants: [
      {
        sku: "GD-YAG-5L",
        barcode: "8690004000016",
        unit: "TENEKE",
        unitsPerCase: 4,
        moqUnits: 4,
        pricingUnit: "LT",
        unitFactor: 5,
        price: 71.9,
        costPrice: 59,
        tracksLots: true,
        shelfLifeDays: 365,
        shelfCode: "KR-E1",
        minStock: 30,
        lots: [
          { code: "AY-2605-11", daysToExpiry: 240, quantity: 80 },
          { code: "AY-2601-04", daysToExpiry: 19, quantity: 16 },
        ],
      },
    ],
  },
  {
    name: "Zeytinyağı Naturel Sızma 2 L",
    slug: "zeytinyagi-2l",
    brand: "Altınyağ",
    category: "yag-sirke",
    vatRate: 1,
    variants: [
      {
        sku: "GD-ZYT-2L",
        unit: "ŞİŞE",
        unitsPerCase: 6,
        moqUnits: 6,
        pricingUnit: "LT",
        unitFactor: 2,
        price: 244.0,
        costPrice: 205,
        tracksLots: true,
        shelfLifeDays: 540,
        shelfCode: "KR-E2",
        lots: [{ code: "AY-ZY-2604", daysToExpiry: 400, quantity: 36 }],
      },
    ],
  },
  {
    name: "Maden Suyu 200 ml",
    slug: "maden-suyu-200ml",
    brand: "Kaynak",
    category: "icecek",
    vatRate: 10,
    variants: [
      {
        sku: "GD-MDN-200",
        barcode: "8690005000013",
        unit: "KOLİ",
        unitsPerCase: 24,
        moqUnits: 24,
        price: 186.0,
        costPrice: 152,
        tracksLots: true,
        shelfLifeDays: 270,
        shelfCode: "KR-F1",
        lots: [
          { code: "KY-MD-2606", daysToExpiry: 190, quantity: 120 },
          { code: "KY-MD-2602", daysToExpiry: 12, quantity: 48 },
        ],
      },
    ],
  },
  {
    name: "Sucuk Fermente 500 g",
    slug: "sucuk-fermente-500g",
    brand: "Yayla Et",
    category: "sarkuteri",
    vatRate: 10,
    variants: [
      {
        sku: "GD-SCK-500",
        unit: "ADET",
        unitsPerCase: 10,
        moqUnits: 10,
        price: 214.0,
        costPrice: 176,
        tracksLots: true,
        shelfLifeDays: 60,
        expiryWarningDays: 14,
        shelfCode: "SOG-C1",
        minStock: 20,
        lots: [
          { code: "YE-SC-2608", daysToExpiry: 11, quantity: 30 },
          { code: "YE-SC-2615", daysToExpiry: 44, quantity: 50 },
        ],
      },
    ],
  },
  {
    name: "Dana Salam 1 kg",
    slug: "dana-salam-1kg",
    brand: "Yayla Et",
    category: "sarkuteri",
    vatRate: 10,
    variants: [
      {
        sku: "GD-SLM-1KG",
        barcode: "8690006000010",
        unit: "ADET",
        unitsPerCase: 8,
        moqUnits: 8,
        price: 268.0,
        costPrice: 214,
        tracksLots: true,
        shelfLifeDays: 75,
        expiryWarningDays: 20,
        shelfCode: "SOG-C2",
        minStock: 24,
        lots: [
          { code: "YE-SL-2611", daysToExpiry: 18, quantity: 40 },
          { code: "YE-SL-2620", daysToExpiry: 58, quantity: 64 },
        ],
      },
    ],
  },
  {
    name: "Macar Salam Dilimli 200 g",
    slug: "macar-salam-dilimli-200g",
    brand: "Yayla Et",
    category: "sarkuteri",
    vatRate: 10,
    variants: [
      {
        sku: "GD-MCR-200",
        unit: "KOLİ",
        unitsPerCase: 20,
        moqUnits: 20,
        price: 1_180.0,
        costPrice: 960,
        tracksLots: true,
        shelfLifeDays: 45,
        expiryWarningDays: 12,
        shelfCode: "SOG-C3",
        minStock: 15,
        lots: [
          { code: "YE-MC-2607", daysToExpiry: 6, quantity: 15 },
          { code: "YE-MC-2618", daysToExpiry: 33, quantity: 45 },
        ],
      },
    ],
  },
  {
    name: "Dana Kavurma 800 g",
    slug: "dana-kavurma-800g",
    brand: "Yayla Et",
    category: "sarkuteri",
    vatRate: 10,
    variants: [
      {
        sku: "GD-KVR-800",
        unit: "KOLİ",
        unitsPerCase: 6,
        moqUnits: 6,
        pricingUnit: "KG",
        unitFactor: 4.8,
        price: 690.0,
        costPrice: 566,
        tracksLots: true,
        shelfLifeDays: 365,
        shelfCode: "KR-G1",
        lots: [{ code: "YE-KV-2603", daysToExpiry: 280, quantity: 30 }],
      },
    ],
  },
  {
    name: "Streç Film 45 cm",
    slug: "strec-film-45cm",
    brand: "Paketsan",
    category: "bakliyat",
    vatRate: 20,
    variants: [
      {
        // Parti takibi **kapalı** bir kalem bilerek duruyor: gıda kurulumunda da
        // ambalaj/sarf malzemesi vardır ve o kalemde SKT sorusu sorulmamalı.
        sku: "GD-STR-45",
        unit: "RULO",
        unitsPerCase: 6,
        moqUnits: 6,
        price: 148.0,
        costPrice: 119,
        tracksLots: false,
        shelfCode: "KR-Z1",
        stock: 90,
      },
    ],
  },
];

// ─────────────────────────────────────────────
// YARDIMCILAR
// ─────────────────────────────────────────────

/** Bugünün gece yarısına göre `days` gün sonrası — servisle aynı hesap. */
function dayFromNow(days: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
}

async function main() {
  console.log("Gıda gösterim kataloğu yazılıyor…");

  // ── kategoriler ──
  const categoryIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name },
      create: { name: c.name, slug: c.slug },
      select: { id: true },
    });
    categoryIds.set(c.slug, row.id);
  }
  console.log(`  ${CATEGORIES.length} kategori`);

  const groups = await prisma.customerGroup.findMany({
    select: { id: true, name: true },
  });

  let variantCount = 0;
  let lotCount = 0;

  for (const p of PRODUCTS) {
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) throw new Error(`Kategori yok: ${p.category}`);

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { name: p.name, brand: p.brand, vatRate: p.vatRate, categoryId },
      create: {
        name: p.name,
        slug: p.slug,
        brand: p.brand,
        vatRate: p.vatRate,
        categoryId,
        images: [],
      },
      select: { id: true },
    });

    for (const v of p.variants) {
      const variant = await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: {
          unit: v.unit,
          unitsPerCase: v.unitsPerCase,
          moqUnits: v.moqUnits,
          pricingUnit: v.pricingUnit ?? null,
          unitFactor: v.unitFactor ?? null,
          tracksLots: v.tracksLots,
          shelfLifeDays: v.shelfLifeDays ?? null,
          expiryWarningDays: v.expiryWarningDays ?? null,
          isVariableWeight: v.isVariableWeight ?? false,
          shelfCode: v.shelfCode ?? null,
          minStock: v.minStock ?? null,
          costPrice: v.costPrice ?? null,
          productId: product.id,
        },
        create: {
          sku: v.sku,
          barcode: v.barcode ?? null,
          productId: product.id,
          unit: v.unit,
          unitsPerCase: v.unitsPerCase,
          moqUnits: v.moqUnits,
          pricingUnit: v.pricingUnit ?? null,
          unitFactor: v.unitFactor ?? null,
          tracksLots: v.tracksLots,
          shelfLifeDays: v.shelfLifeDays ?? null,
          expiryWarningDays: v.expiryWarningDays ?? null,
          isVariableWeight: v.isVariableWeight ?? false,
          shelfCode: v.shelfCode ?? null,
          minStock: v.minStock ?? null,
          costPrice: v.costPrice ?? null,
          stock: 0,
        },
        select: { id: true },
      });
      variantCount++;

      // ── fiyat: liste + gruplara indirimli kademe ──
      //
      // Fiyat `pricingUnit` doluysa **kg/lt başına**; satış birimine çeviren
      // çarpan fiyatlamanın girişinde uygulanıyor. Buradaki sayı bu yüzden
      // "kasa fiyatı" değil, toptancının telefonda söylediği kilo fiyatı.
      await upsertPrice(variant.id, null, v.price);
      for (const g of groups) {
        const factor =
          g.name === "Zincir Market" ? 0.9 : g.name === "Toptancı" ? 0.94 : 1;
        if (factor === 1) continue;
        await upsertPrice(variant.id, g.id, Number((v.price * factor).toFixed(2)));
      }

      // ── partiler ──
      if (v.lots?.length) {
        for (const lot of v.lots) {
          lotCount += await upsertLot(variant.id, lot);
        }
        // Toplam stok, partilerin bakiyesidir. Defter tek kapıdan yazılır ama
        // seed defterin dışından konuşuyor: gösterim başlarken bilinen bir
        // başlangıç noktası, geçmişi olan bir defterden daha değerli.
        const sum = await prisma.stockLot.aggregate({
          where: { variantId: variant.id },
          _sum: { onHand: true },
        });
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { stock: sum._sum.onHand ?? 0 },
        });
      } else if (v.stock !== undefined) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { stock: v.stock },
        });
      }
    }
  }

  console.log(`  ${PRODUCTS.length} ürün, ${variantCount} varyant, ${lotCount} parti`);
  console.log("Bitti. Vitrin: /portal · Partiler: /admin/stok");
}

async function upsertPrice(
  variantId: string,
  customerGroupId: string | null,
  price: number,
): Promise<void> {
  const existing = await prisma.price.findFirst({
    where: { variantId, customerGroupId, minQuantity: 1 },
    select: { id: true },
  });
  if (existing) {
    await prisma.price.update({ where: { id: existing.id }, data: { price } });
    return;
  }
  await prisma.price.create({
    data: { variantId, customerGroupId, minQuantity: 1, price, currency: "TRY" },
  });
}

async function upsertLot(
  variantId: string,
  lot: { code: string; daysToExpiry: number; quantity: number; blocked?: boolean },
): Promise<number> {
  const expiryDate = dayFromNow(lot.daysToExpiry);
  const existing = await prisma.stockLot.findUnique({
    where: { variantId_code: { variantId, code: lot.code } },
    select: { id: true },
  });

  if (existing) {
    await prisma.stockLot.update({
      where: { id: existing.id },
      data: { expiryDate, onHand: lot.quantity, isBlocked: lot.blocked ?? false },
    });
    return 0;
  }

  await prisma.stockLot.create({
    data: {
      variantId,
      code: lot.code,
      expiryDate,
      onHand: lot.quantity,
      isBlocked: lot.blocked ?? false,
    },
  });
  return 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
