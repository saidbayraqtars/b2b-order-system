import { prisma } from "@repo/database";
import { BusinessError } from "./errors";
import { slugify } from "./slug";
import { loadTenant } from "./tenant";

// Kurulum sihirbazı — "bu kurulumda daha ne eksik" sorusunun tek cevabı.
//
// Boş bir veritabanına bakan kişi ne yapacağını ekrandan çıkaramıyor: ürün
// eklemek için kategori, fiyat vermek için müşteri grubu, stok girmek için depo
// gerekiyor ve bunların hiçbiri hata mesajında yazmıyor — sıra yanlış olunca
// ekran boş bir liste gösteriyor, sebebini söylemiyor. Buradaki iki parça o
// boşluğu dolduruyor:
//
//   1. `getSetupStatus` — her adımın **canlı** durumu. Sayılar veritabanından
//      okunuyor, bir yerde tutulan "kurulum tamamlandı" bayrağı yok: kullanıcı
//      son firmayı silerse o adım kendiliğinden geri açılır.
//   2. `applySetupPack` — sektöre göre hazır iskelet (grup, kategori, vade,
//      depo, kasa, hacim merdiveni). Elle otuz satır girmek yerine tek düğme.
//
// Paket neden **kod**, neden veritabanı yedeği değil: yedek, alındığı günün
// şemasına ait. Bir sonraki sürümün göçü çalıştığında eski dump artık
// yüklenmiyor, üstelik içinde gösterim kullanıcıları ve siparişleri de
// taşınıyor. Paket ise göçlerle birlikte yaşayan sıradan kod — kurulumdan sonra
// da çalıştırılabilir ve yalnızca eksik satırı yazar.

// ─────────────────────────────────────────────
// DURUM
// ─────────────────────────────────────────────

export type SetupStepKey =
  | "tenant"
  | "customerGroups"
  | "categories"
  | "warehouses"
  | "products"
  | "prices"
  | "paymentTerms"
  | "cashAccounts"
  | "companies"
  | "users"
  | "stock"
  | "erp";

export interface SetupStep {
  key: SetupStepKey;
  /** Kaç satır var. `tenant` için 0/1 — dosya okunabildi mi. */
  count: number;
  done: boolean;
  /**
   * Sistem bu adım olmadan da sipariş alabilir mi. İsteğe bağlı adımlar
   * "kurulum bitti" hesabına girmez, ama listede durur ki unutulmasınlar.
   */
  optional: boolean;
  /** `tenant` adımının okuma hatası — belge başlığı bu yüzden basılamaz. */
  problem?: string;
}

export interface SetupStatus {
  steps: SetupStep[];
  /** Zorunlu adımların hepsi tamam mı — sipariş alınabilir hâle geldi mi. */
  ready: boolean;
  /** Tamamlanan zorunlu adım / toplam zorunlu adım. */
  progress: { done: number; total: number };
}

const OPTIONAL: ReadonlySet<SetupStepKey> = new Set<SetupStepKey>(["stock", "erp"]);

export async function getSetupStatus(): Promise<SetupStatus> {
  const [
    customerGroups,
    categories,
    warehouses,
    products,
    prices,
    paymentTerms,
    cashAccounts,
    companies,
    users,
    stock,
    erp,
  ] = await Promise.all([
    prisma.customerGroup.count(),
    prisma.category.count(),
    prisma.warehouse.count(),
    prisma.productVariant.count(),
    prisma.price.count(),
    prisma.paymentTerm.count(),
    prisma.cashAccount.count(),
    prisma.company.count(),
    // Süper admin sayılmıyor: kurulumu yapan kişinin kendisi bir adım değil.
    prisma.user.count({ where: { role: { not: "SUPER_ADMIN" } } }),
    prisma.stockMovement.count(),
    prisma.erpAgent.count(),
  ]);

  let tenantOk = false;
  let problem: string | undefined;
  try {
    await loadTenant();
    tenantOk = true;
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }

  const counts: Record<SetupStepKey, number> = {
    tenant: tenantOk ? 1 : 0,
    customerGroups,
    categories,
    warehouses,
    products,
    prices,
    paymentTerms,
    cashAccounts,
    companies,
    users,
    stock,
    erp,
  };

  const steps: SetupStep[] = (Object.keys(counts) as SetupStepKey[]).map((key) => ({
    key,
    count: counts[key],
    done: counts[key] > 0,
    optional: OPTIONAL.has(key),
    ...(key === "tenant" && problem ? { problem } : {}),
  }));

  const required = steps.filter((s) => !s.optional);
  return {
    steps,
    ready: required.every((s) => s.done),
    progress: {
      done: required.filter((s) => s.done).length,
      total: required.length,
    },
  };
}

// ─────────────────────────────────────────────
// SEKTÖR PAKETLERİ
// ─────────────────────────────────────────────

interface PackCategory {
  name: string;
  children?: readonly string[];
}

export interface SetupPack {
  key: string;
  name: string;
  summary: string;
  customerGroups: readonly { name: string; description: string }[];
  categories: readonly PackCategory[];
  paymentTerms: readonly { name: string; days: number }[];
  warehouses: readonly { code: string; name: string }[];
  cashAccounts: readonly { name: string; kind: "CASH" | "BANK" | "POS" }[];
  volumeTiers: readonly {
    name: string;
    minRevenue: number;
    windowMonths: number;
    discountPercent: number;
  }[];
}

/**
 * Paketler ürün taşımaz — yalnızca **iskelet**.
 *
 * Ürün, fiyat ve müşteri her firmada başkadır; hazır ürün koymak, kurulumu
 * yapan kişiye silmesi gereken bir liste bırakmak olurdu. İskelet ise her gıda
 * toptancısında hemen hemen aynı: kategori ağacı, müşteri tipleri, piyasadaki
 * vadeler, bir depo ve bir kasa.
 */
export const SETUP_PACKS: readonly SetupPack[] = [
  {
    key: "gida-toptan",
    name: "Gıda toptancısı",
    summary:
      "Şarküteri/süt/dondurulmuş ayrımı, soğuk hava deposu, piyasadaki 7–45 gün vadeleri.",
    customerGroups: [
      { name: "Bakkal / Market", description: "Tekil perakende noktası" },
      { name: "Zincir Market", description: "Merkezden alım yapan zincir" },
      { name: "Toptancı", description: "Kendi bayisine satan ara halka" },
      { name: "HORECA", description: "Otel, restoran, kafe, catering" },
    ],
    categories: [
      {
        name: "Şarküteri",
        children: ["Sucuk", "Salam", "Sosis", "Pastırma & Kavurma"],
      },
      {
        name: "Süt Ürünleri",
        children: ["Peynir", "Yoğurt & Ayran", "Süt", "Tereyağı"],
      },
      { name: "Dondurulmuş", children: ["Et & Tavuk", "Hamur İşi", "Sebze"] },
      {
        name: "Kuru Gıda",
        children: ["Bakliyat", "Un & Şeker", "Konserve & Salça", "Yağ"],
      },
      { name: "İçecek", children: ["Su & Maden Suyu", "Meşrubat"] },
      { name: "Temizlik & Sarf", children: ["Ambalaj", "Temizlik"] },
    ],
    paymentTerms: [
      { name: "Peşin", days: 0 },
      { name: "7 gün", days: 7 },
      { name: "14 gün", days: 14 },
      { name: "30 gün", days: 30 },
      { name: "45 gün", days: 45 },
    ],
    warehouses: [
      { code: "MRK", name: "Merkez Depo" },
      { code: "SOGUK", name: "Soğuk Hava Deposu" },
    ],
    cashAccounts: [
      { name: "Merkez Kasa", kind: "CASH" },
      { name: "Banka — Vadesiz", kind: "BANK" },
    ],
    volumeTiers: [
      { name: "Bronz", minRevenue: 100_000, windowMonths: 1, discountPercent: 1 },
      { name: "Gümüş", minRevenue: 250_000, windowMonths: 1, discountPercent: 2 },
      { name: "Altın", minRevenue: 500_000, windowMonths: 1, discountPercent: 3.5 },
    ],
  },
  {
    key: "genel-toptan",
    name: "Genel toptan",
    summary: "Sektörden bağımsız en küçük iskelet: tek depo, tek kasa, üç vade.",
    customerGroups: [
      { name: "Bayi", description: "Standart bayi fiyat listesi" },
      { name: "Toptancı", description: "Yüksek hacimli alıcı" },
      { name: "Perakende", description: "Liste fiyatı" },
    ],
    categories: [{ name: "Genel" }],
    paymentTerms: [
      { name: "Peşin", days: 0 },
      { name: "30 gün", days: 30 },
      { name: "60 gün", days: 60 },
    ],
    warehouses: [{ code: "MRK", name: "Merkez Depo" }],
    cashAccounts: [{ name: "Merkez Kasa", kind: "CASH" }],
    volumeTiers: [],
  },
];

export function listSetupPacks(): readonly SetupPack[] {
  return SETUP_PACKS;
}

export interface PackApplyReport {
  pack: string;
  /** Ne yazıldı / neye dokunulmadı — tür başına sayı. */
  created: Record<string, number>;
  skipped: Record<string, number>;
}

function bump(bag: Record<string, number>, key: string): void {
  bag[key] = (bag[key] ?? 0) + 1;
}

/**
 * Paketi kurulumda **eksik olan** satırlar için uygular.
 *
 * Tekrar çalıştırılabilir olması bir kolaylık değil, gereklilik: kurulumu yapan
 * kişi paketi uygulayıp iki kategori adını değiştirdikten sonra düğmeye ikinci
 * kez basabilir. Var olanı yeniden yazmak, o düzenlemeyi sessizce geri alırdı.
 * Bu yüzden eşleşme kuralı her tür için o türün eşsiz anahtarı: grup/vade/kasa
 * adı, kategori slug değeri, depo kodu.
 */
export async function applySetupPack(key: string): Promise<PackApplyReport> {
  const pack = SETUP_PACKS.find((p) => p.key === key);
  if (!pack) {
    throw new BusinessError("INVALID_STATE", `Bilinmeyen kurulum paketi: ${key}`);
  }

  const created: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  for (const g of pack.customerGroups) {
    const existing = await prisma.customerGroup.findUnique({
      where: { name: g.name },
      select: { id: true },
    });
    if (existing) {
      bump(skipped, "Müşteri grubu");
      continue;
    }
    await prisma.customerGroup.create({
      data: { name: g.name, description: g.description },
    });
    bump(created, "Müşteri grubu");
  }

  for (const c of pack.categories) {
    const parentId = await upsertCategory(c.name, null, created, skipped);
    for (const child of c.children ?? []) {
      await upsertCategory(child, parentId, created, skipped);
    }
  }

  let order = 0;
  for (const t of pack.paymentTerms) {
    order += 10;
    const existing = await prisma.paymentTerm.findUnique({
      where: { name: t.name },
      select: { id: true },
    });
    if (existing) {
      bump(skipped, "Vade");
      continue;
    }
    await prisma.paymentTerm.create({
      data: { name: t.name, days: t.days, sortOrder: order },
    });
    bump(created, "Vade");
  }

  // Varsayılan depo/kasa yalnızca **hiç yoksa** işaretleniyor: ikinci bir
  // varsayılan, stok ve para akışının nereye düşeceğini belirsiz bırakır.
  let hasDefaultWarehouse =
    (await prisma.warehouse.count({ where: { isDefault: true } })) > 0;
  for (const w of pack.warehouses) {
    const existing = await prisma.warehouse.findUnique({
      where: { code: w.code },
      select: { id: true },
    });
    if (existing) {
      bump(skipped, "Depo");
      continue;
    }
    await prisma.warehouse.create({
      data: { code: w.code, name: w.name, isDefault: !hasDefaultWarehouse },
    });
    hasDefaultWarehouse = true;
    bump(created, "Depo");
  }

  let hasDefaultAccount =
    (await prisma.cashAccount.count({ where: { isDefault: true } })) > 0;
  let accountOrder = 0;
  for (const a of pack.cashAccounts) {
    accountOrder += 10;
    const existing = await prisma.cashAccount.findUnique({
      where: { name: a.name },
      select: { id: true },
    });
    if (existing) {
      bump(skipped, "Kasa/banka");
      continue;
    }
    await prisma.cashAccount.create({
      data: {
        name: a.name,
        kind: a.kind,
        isDefault: !hasDefaultAccount,
        sortOrder: accountOrder,
      },
    });
    hasDefaultAccount = true;
    bump(created, "Kasa/banka");
  }

  for (const v of pack.volumeTiers) {
    const existing = await prisma.volumeTier.findUnique({
      where: { name: v.name },
      select: { id: true },
    });
    if (existing) {
      bump(skipped, "Hacim kademesi");
      continue;
    }
    await prisma.volumeTier.create({
      data: {
        name: v.name,
        minRevenue: v.minRevenue,
        windowMonths: v.windowMonths,
        discountPercent: v.discountPercent,
        sortOrder: Math.round(v.minRevenue / 1000),
      },
    });
    bump(created, "Hacim kademesi");
  }

  return { pack: pack.key, created, skipped };
}

async function upsertCategory(
  name: string,
  parentId: string | null,
  created: Record<string, number>,
  skipped: Record<string, number>,
): Promise<string> {
  const slug = slugify(name);
  const existing = await prisma.category.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) {
    bump(skipped, "Kategori");
    return existing.id;
  }
  const row = await prisma.category.create({
    data: { name, slug, parentId },
    select: { id: true },
  });
  bump(created, "Kategori");
  return row.id;
}
