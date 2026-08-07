import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { PrismaClient, Role } from "@prisma/client";
import { defaultPermissionsFor, type Permission } from "@repo/types";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Gösterim verisi: her rolden kullanıcı + gerçek bir katalog.
//
// `seed.ts` bir kurulumun çalışması için gereken en az şeyi yazar. Bu betik
// farklı: sistemi **gösterilebilir** hâle getirir — patrondan müşteriye kadar
// her rolde giriş yapılabilen bir hesap, ve boş bir vitrin yerine gerçek
// ürünlerle dolu bir katalog.
//
// Katalog, ilk müşterinin ERP'sinden (VegaDB) çıkarılmış ürün adları,
// kategorileri, markaları, maliyetleri ve stoklarıdır. Dosya depoya girmez:
// bir müşterinin stok listesi onun ticari verisidir. Dosyayı üretmek için
// apps/erp-agent içinden `node _export.js <yol>` — bkz. README.
//
//   pnpm --filter @repo/database exec tsx prisma/seed-demo.ts [urun.json]

// ─────────────────────────────────────────────
// ŞİFRE
// ─────────────────────────────────────────────

/**
 * Kullanıcının istediği gösterim şifresi.
 *
 * DİKKAT: uygulamanın kendi şifre kuralı (en az 8 karakter, harf + rakam) bunu
 * **kabul etmez**. Giriş çalışır — giriş yalnızca bcrypt karşılaştırması yapar —
 * ama bu hesapların şifresi arayüzden değiştirilmek istendiğinde daha uzun bir
 * şifre seçmek gerekir. Gösterim için bilerek böyle bırakıldı.
 */
const DEMO_PASSWORD = "143688";

// ─────────────────────────────────────────────
// FİYAT
// ─────────────────────────────────────────────

/**
 * Satış fiyatı **türetilmiştir**, ERP'den okunmamıştır.
 *
 * Vega'da satış fiyatının nerede tutulduğu kuruluma göre değişiyor ve ilk
 * müşterinin veritabanında bariz aday olan kolon boş (95.026 kartın 1'i dolu).
 * Gösterim için maliyetin üstüne grup bazlı bir kâr marjı konuyor; gerçek
 * fiyatlar ERP köprüsünün fiyat yönü yazılınca gelecek.
 */
const MARKUP: Record<string, number> = {
  "Zincir Market": 1.18,
  Toptancı: 1.3,
  Bayi: 1.45,
};
/** Grubu olmayana uygulanan liste fiyatı — varsayılan kademe. */
const LIST_MARKUP = 1.75;

// ─────────────────────────────────────────────
// YARDIMCILAR
// ─────────────────────────────────────────────

let counter = 0;
/** Seed-local id. Şema String bekliyor; biçimi kimse okumuyor. */
function id(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${randomBytes(4).toString("hex")}`;
}

const usedSlugs = new Set<string>();
function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
    ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
  };
  let base = input
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!base) base = "urun";

  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
  usedSlugs.add(slug);
  return slug;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** KOD1 alanı hem kategori hem marka taşıyor; bariz eşleri tek isme indiriyoruz. */
const CATEGORY_ALIASES: Record<string, string> = {
  ZÜCCA: "ZÜCCACİYE",
  ZUCCA: "ZÜCCACİYE",
  PROFİLO: "BEYAZ EŞYA",
  PROFİ: "BEYAZ EŞYA",
  MOBİL: "MOBİLYA",
  BATTAN: "TEKSTİL",
};

interface SourceProduct {
  code: string;
  name: string;
  category: string;
  brand: string | null;
  cost: number;
  stock: number;
}

// ─────────────────────────────────────────────
// KULLANICILAR
// ─────────────────────────────────────────────

interface SeedUser {
  email: string;
  name: string;
  role: Role;
  /** Hangi müşteri firmasına bağlı — yalnızca alıcı roller için. */
  company?: string;
  title: string;
  /**
   * Verilmezse rolün şablonu uygulanır. Elle verilen küme, aynı roldeki iki
   * hesabın farklı yetkilerle çalışabildiğini gösterir — muhasebeci her şeyi
   * gören bir yönetici değil.
   */
  permissions?: Permission[];
}

/**
 * Her rolden bir giriş.
 *
 * Sistemde dört rol var; "patron", "IT" ve "satış müdürü" ayrı yetki seviyeleri
 * değil, aynı SUPER_ADMIN rolünün farklı insanları. Ayrı hesaplar olmaları
 * yine de anlamlı: denetim kaydı kimin ne yaptığını isimle gösteriyor, ve bir
 * kişinin ayrılması diğerlerinin girişini etkilemiyor.
 */
const USERS: SeedUser[] = [
  { email: "patron@bayraktar.local", name: "Said Bayraktar", role: Role.SUPER_ADMIN, title: "Patron" },
  { email: "it@bayraktar.local", name: "IT Ekibi", role: Role.SUPER_ADMIN, title: "IT" },
  {
    email: "satismudur@bayraktar.local",
    name: "Satış Müdürü",
    role: Role.SUPER_ADMIN,
    title: "Satış müdürü",
    // Katalog, müşteri ve sipariş; kasa ve sistem ayarları dışında.
    permissions: [
      "products.view", "products.manage", "categories.manage", "pricing.manage",
      "promotions.manage", "companies.view", "companies.manage", "groups.manage",
      "orders.view", "orders.create", "orders.approve", "orders.fulfil",
      "documents.view", "reports.view", "reports.build", "volume_tiers.manage",
    ],
  },
  {
    email: "muhasebe@bayraktar.local",
    name: "Muhasebe",
    role: Role.SUPER_ADMIN,
    title: "Muhasebe",
    // Para ve belge; ürün fiyatına ve kullanıcı yönetimine dokunmaz.
    permissions: [
      "companies.view", "orders.view", "cash.view", "cash.manage",
      "payments.view", "payment_terms.manage", "documents.view",
      "documents.manage", "reports.view", "reports.build",
    ],
  },

  { email: "temsilci1@bayraktar.local", name: "Ahmet Yılmaz", role: Role.SALES_REP, title: "Satış temsilcisi" },
  { email: "temsilci2@bayraktar.local", name: "Ayşe Demir", role: Role.SALES_REP, title: "Satış temsilcisi" },
  { email: "temsilci3@bayraktar.local", name: "Kemal Arslan", role: Role.SALES_REP, title: "Satış temsilcisi" },

  { email: "yonetici@akbayi.local", name: "Ak Bayi Yöneticisi", role: Role.COMPANY_ADMIN, company: "Ak Bayi Ticaret", title: "Müşteri yöneticisi" },
  { email: "personel@akbayi.local", name: "Ak Bayi Personeli", role: Role.COMPANY_STAFF, company: "Ak Bayi Ticaret", title: "Müşteri personeli" },
  { email: "yonetici@sahintoptan.local", name: "Şahin Toptan Yöneticisi", role: Role.COMPANY_ADMIN, company: "Şahin Toptan", title: "Müşteri yöneticisi" },
  { email: "personel@sahintoptan.local", name: "Şahin Toptan Personeli", role: Role.COMPANY_STAFF, company: "Şahin Toptan", title: "Müşteri personeli" },
  { email: "yonetici@zincirmarket.local", name: "Zincir Market Yöneticisi", role: Role.COMPANY_ADMIN, company: "Anadolu Zincir Market", title: "Müşteri yöneticisi" },
];

interface SeedCompany {
  name: string;
  group: string;
  externalCode: string;
  creditLimit: number;
  paymentTermDays: number;
  requiresOrderApproval: boolean;
}

const COMPANIES: SeedCompany[] = [
  { name: "Ak Bayi Ticaret", group: "Bayi", externalCode: "A10001", creditLimit: 500_000, paymentTermDays: 30, requiresOrderApproval: false },
  { name: "Şahin Toptan", group: "Toptancı", externalCode: "A10002", creditLimit: 2_000_000, paymentTermDays: 60, requiresOrderApproval: true },
  { name: "Anadolu Zincir Market", group: "Zincir Market", externalCode: "A10003", creditLimit: 5_000_000, paymentTermDays: 90, requiresOrderApproval: true },
];

const GROUPS = [
  { name: "Bayi", description: "Standart bayi grubu" },
  { name: "Toptancı", description: "Yüksek hacimli toptan alıcı" },
  { name: "Zincir Market", description: "Sözleşmeli zincir müşteri" },
];

async function seedUsers(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const group of GROUPS) {
    await prisma.customerGroup.upsert({
      where: { name: group.name },
      update: { description: group.description },
      create: group,
    });
  }
  const groupIds = new Map(
    (await prisma.customerGroup.findMany({ select: { id: true, name: true } })).map(
      (g) => [g.name, g.id] as const,
    ),
  );

  // Reps first: a company's assigned rep has to exist before it points at one.
  const reps: string[] = [];
  for (const user of USERS) {
    if (user.role !== Role.SALES_REP) continue;
    const row = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        permissions: user.permissions ?? defaultPermissionsFor(user.role),
        isActive: true,
      },
      create: {
        email: user.email,
        name: user.name,
        passwordHash,
        role: user.role,
        permissions: user.permissions ?? defaultPermissionsFor(user.role),
      },
      select: { id: true },
    });
    reps.push(row.id);
  }

  const companyIds = new Map<string, string>();
  for (const [index, company] of COMPANIES.entries()) {
    const row = await prisma.company.upsert({
      where: { externalCode: company.externalCode },
      update: {
        name: company.name,
        creditLimit: company.creditLimit,
        paymentTermDays: company.paymentTermDays,
        requiresOrderApproval: company.requiresOrderApproval,
        customerGroupId: groupIds.get(company.group) ?? null,
        salesRepId: reps[index % reps.length] ?? null,
      },
      create: {
        name: company.name,
        externalCode: company.externalCode,
        creditLimit: company.creditLimit,
        paymentTermDays: company.paymentTermDays,
        requiresOrderApproval: company.requiresOrderApproval,
        customerGroupId: groupIds.get(company.group) ?? null,
        salesRepId: reps[index % reps.length] ?? null,
      },
      select: { id: true },
    });
    companyIds.set(company.name, row.id);
  }

  for (const user of USERS) {
    if (user.role === Role.SALES_REP) continue;
    const companyId = user.company ? (companyIds.get(user.company) ?? null) : null;
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        companyId,
        permissions: user.permissions ?? defaultPermissionsFor(user.role),
        isActive: true,
      },
      create: {
        email: user.email,
        name: user.name,
        passwordHash,
        role: user.role,
        companyId,
        permissions: user.permissions ?? defaultPermissionsFor(user.role),
      },
    });
  }

  console.log(`✓ ${USERS.length} kullanıcı, ${COMPANIES.length} firma, ${GROUPS.length} grup`);
}

// ─────────────────────────────────────────────
// KATALOG
// ─────────────────────────────────────────────

async function seedCatalogue(sourcePath: string): Promise<void> {
  if (!existsSync(sourcePath)) {
    console.log(`⚠ Ürün dosyası yok (${sourcePath}) — katalog atlandı.`);
    return;
  }

  const source = JSON.parse(readFileSync(sourcePath, "utf8")) as SourceProduct[];
  const groups = await prisma.customerGroup.findMany({ select: { id: true, name: true } });

  // Kategoriler
  const categoryNames = [
    ...new Set(source.map((p) => CATEGORY_ALIASES[p.category] ?? p.category)),
  ].filter(Boolean);

  const categoryIds = new Map<string, string>();
  for (const name of categoryNames) {
    const existing = await prisma.category.findFirst({
      where: { name },
      select: { id: true },
    });
    if (existing) {
      categoryIds.set(name, existing.id);
      continue;
    }
    const row = await prisma.category.create({
      data: { name, slug: slugify(name) },
      select: { id: true },
    });
    categoryIds.set(name, row.id);
  }

  // Aynı stok kodu iki kez gelmesin; SKU tekil.
  const seen = new Set<string>();
  const existingSkus = new Set(
    (await prisma.productVariant.findMany({ select: { sku: true } })).map((v) => v.sku),
  );
  const existingSlugs = await prisma.product.findMany({ select: { slug: true } });
  for (const p of existingSlugs) usedSlugs.add(p.slug);

  const products: Array<{
    id: string;
    name: string;
    slug: string;
    brand: string | null;
    categoryId: string;
    vatRate: number;
  }> = [];
  const variants: Array<{
    id: string;
    sku: string;
    externalCode: string;
    productId: string;
    stock: number;
  }> = [];
  const prices: Array<{
    variantId: string;
    customerGroupId: string | null;
    minQuantity: number;
    price: number;
  }> = [];

  for (const row of source) {
    const code = row.code.trim();
    if (!code || seen.has(code) || existingSkus.has(code)) continue;
    seen.add(code);

    const categoryName = CATEGORY_ALIASES[row.category] ?? row.category;
    const categoryId = categoryIds.get(categoryName);
    if (!categoryId) continue;

    const productId = id("p");
    const variantId = id("v");

    products.push({
      id: productId,
      name: row.name,
      slug: slugify(row.name),
      brand: row.brand,
      categoryId,
      vatRate: 20,
    });
    variants.push({
      id: variantId,
      sku: code,
      // The catalogue arrives already mapped to the ERP, so the agent's stock
      // sync has something to match on from the first run.
      externalCode: code,
      productId,
      stock: Math.max(0, row.stock),
    });

    prices.push({
      variantId,
      customerGroupId: null,
      minQuantity: 1,
      price: round2(row.cost * LIST_MARKUP),
    });
    for (const group of groups) {
      const markup = MARKUP[group.name];
      if (!markup) continue;
      prices.push({
        variantId,
        customerGroupId: group.id,
        minQuantity: 1,
        price: round2(row.cost * markup),
      });
    }
  }

  // Toplu yazım: 2.600 ürün için satır satır insert dakikalar sürerdi.
  const CHUNK = 500;
  for (let i = 0; i < products.length; i += CHUNK) {
    await prisma.product.createMany({ data: products.slice(i, i + CHUNK) });
  }
  for (let i = 0; i < variants.length; i += CHUNK) {
    await prisma.productVariant.createMany({ data: variants.slice(i, i + CHUNK) });
  }
  for (let i = 0; i < prices.length; i += CHUNK) {
    await prisma.price.createMany({ data: prices.slice(i, i + CHUNK) });
  }

  console.log(
    `✓ ${categoryIds.size} kategori, ${products.length} ürün, ${variants.length} varyant, ${prices.length} fiyat`,
  );
}

// ─────────────────────────────────────────────

async function main(): Promise<void> {
  const sourcePath = path.resolve(
    process.argv[2] ?? process.env.DEMO_PRODUCTS ?? "products.json",
  );

  await seedUsers();
  await seedCatalogue(sourcePath);

  console.log(`\nTüm gösterim hesaplarının şifresi: ${DEMO_PASSWORD}`);
  console.log("Uyarı: bu şifre uygulamanın kendi kuralını (8+ karakter, harf+rakam) karşılamaz —");
  console.log("giriş çalışır, ama arayüzden değiştirilmek istenirse daha uzun bir şifre gerekir.");
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
