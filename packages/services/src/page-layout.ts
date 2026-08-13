import { type Prisma, prisma } from "@repo/database";
import {
  type PageBlockInput,
  type PageKey,
  PageKeyEnum,
  type PageLayoutInput,
} from "@repo/types";
import { BusinessError } from "./errors";

// Sayfa düzeni motoru.
//
// Vitrinin blok sırası koda gömülüydü. Bunu değiştirmek derleme ve dağıtım
// istiyordu, oysa "kampanya bandını arama kutusunun üstüne al" bir tasarım
// kararı. Artık düzen veri: sıralı bir blok listesi.
//
// **Kayıt defteri güvenlik sınırıdır** — rapor tasarımcısı (report-registry.ts)
// ve kampanya motorundaki (promotion-engine.ts) kuralın aynısı. İstemciden gelen
// blok tipi asla doğrudan kullanılmıyor: burada listelenmeyen tip kaydedilemez.
// Kaydedilmiş ama artık tanınmayan tip ise **çizilmez**; eski bir kayıt yeni
// sürümü düşürmemeli.

// ─────────────────────────────────────────────
// KAYIT DEFTERİ
// ─────────────────────────────────────────────

/** Bir blok ayarının biçimi — yönetim ekranı formu bunu okuyarak çiziliyor. */
export type BlockParamDef =
  | { key: string; label: string; type: "text"; maxLength: number; hint?: string }
  | { key: string; label: string; type: "number"; min: number; max: number; hint?: string }
  | { key: string; label: string; type: "boolean"; hint?: string };

/**
 * Bloğun sayfadaki yeri.
 *
 * `stack` sayfanın tam genişliğinde, üst üste; `row` üç sütunlu katalog
 * satırının bir sütunu. Ayrım gerçek: sepet panelini duyuruların üstüne tam
 * genişlikte bir bant olarak koymak "esneklik" değil, bozuk sayfa olurdu.
 * Sıra her bölgenin **kendi içinde** kayıttan geliyor.
 */
export type BlockRegion = "stack" | "row";

export interface BlockDef {
  label: string;
  /** Ekranda ne işe yaradığını anlatan tek cümle. */
  description: string;
  region: BlockRegion;
  /**
   * Kaldırılamaz blok. Ürün ızgarası olmayan bir vitrin çalışmıyor demektir ve
   * bunu yönetim ekranından yapılabilir kılmak, kendini vurmanın kolay yolu.
   * Kapatılabilir de değil — `enabled: false` da reddediliyor.
   */
  required?: boolean;
  params: readonly BlockParamDef[];
}

/**
 * Vitrin ana sayfasının blokları.
 *
 * Sıra buradaki sıra değil — bu yalnızca *hangi bloklar var* sorusunun cevabı.
 * Sıra kayıtta.
 */
const PORTAL_HOME_BLOCKS: Record<string, BlockDef> = {
  ANNOUNCEMENTS: {
    label: "Duyurular",
    description:
      "Kayan şerit, kapatılabilir bant ve açılış penceresi. İçerik /admin/announcements'ta.",
    region: "stack",
    params: [],
  },
  RICH_TEXT: {
    label: "Serbest metin",
    description:
      "Başlık + paragraf. Duyurudan farkı: kalıcı, tarihi yok, herkese aynı.",
    region: "stack",
    params: [
      { key: "title", label: "Başlık", type: "text", maxLength: 120 },
      { key: "body", label: "Metin", type: "text", maxLength: 600 },
    ],
  },
  SEARCH_BAR: {
    label: "Arama ve sıralama",
    description: "Ürün adı/marka/SKU/barkod araması, sıralama ve 'stokta' süzgeci.",
    region: "stack",
    params: [
      {
        key: "showStockFilter",
        label: "'Stokta' süzgeci çıksın",
        type: "boolean",
      },
    ],
  },
  CATEGORY_SIDEBAR: {
    label: "Kategori kenar çubuğu",
    description: "Soldaki kategori listesi. Kapatılırsa ızgara genişler.",
    region: "row",
    params: [],
  },
  PRODUCT_GRID: {
    label: "Ürün ızgarası",
    description: "Katalog kartları. Vitrinin kendisi — kaldırılamaz.",
    region: "row",
    required: true,
    params: [
      {
        key: "columns",
        label: "Geniş ekranda sütun sayısı",
        type: "number",
        min: 2,
        max: 4,
        hint: "Dar ekranda her hâlde tek sütuna düşer",
      },
    ],
  },
  CART_PANEL: {
    label: "Sepet paneli",
    description:
      "Sağdaki sepet özeti. Kapatmak sepeti kaldırmaz; sipariş yine /portal/cart üzerinden verilir.",
    region: "row",
    params: [],
  },
};

export const PAGE_REGISTRY: Record<PageKey, Record<string, BlockDef>> = {
  PORTAL_HOME: PORTAL_HOME_BLOCKS,
};

/**
 * Sayfanın hiç kaydı yokken çizilecek düzen.
 *
 * Bu liste, Adım 53'e kadar JSX'te duran sıranın ta kendisi: kayıt yoksa vitrin
 * bugüne kadarki gibi görünüyor. "Varsayılan boş liste" olsaydı, göç sonrası
 * ilk açılışta vitrin bomboş çıkardı.
 */
const DEFAULTS: Record<PageKey, PageBlockInput[]> = {
  PORTAL_HOME: [
    { type: "ANNOUNCEMENTS", params: {}, enabled: true },
    { type: "SEARCH_BAR", params: { showStockFilter: true }, enabled: true },
    { type: "CATEGORY_SIDEBAR", params: {}, enabled: true },
    { type: "PRODUCT_GRID", params: { columns: 3 }, enabled: true },
    { type: "CART_PANEL", params: {}, enabled: true },
  ],
};

export interface BlockCatalogEntry extends BlockDef {
  type: string;
}

/** Yönetim ekranının "eklenebilir bloklar" listesi. */
export function listBlockCatalog(page: PageKey): BlockCatalogEntry[] {
  return Object.entries(PAGE_REGISTRY[page]).map(([type, def]) => ({
    type,
    ...def,
  }));
}

// ─────────────────────────────────────────────
// OKUMA
// ─────────────────────────────────────────────

export interface PageBlock {
  type: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

export interface PageLayoutView {
  key: PageKey;
  blocks: PageBlock[];
  updatedAt: string | null;
  updatedByName: string | null;
  /** Kayıt yok — çizilen şey varsayılan. Ekran bunu söylüyor. */
  isDefault: boolean;
}

export async function getPageLayout(key: PageKey): Promise<PageLayoutView> {
  const row = await prisma.pageLayout.findUnique({
    where: { key },
    select: {
      blocks: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });

  if (!row) {
    return {
      key,
      blocks: DEFAULTS[key].map((b) => ({ ...b })),
      updatedAt: null,
      updatedByName: null,
      isDefault: true,
    };
  }

  return {
    key,
    blocks: sanitize(key, row.blocks),
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy?.name ?? null,
    isDefault: false,
  };
}

/**
 * Kayıttaki ham JSON'u çizilebilir bloklara indirge.
 *
 * Kayıt veritabanında ve elle de düzenlenebilir; buradan geçen her şeyin
 * kayıt defterinde karşılığı olduğu garanti. Tanınmayan blok **atılıyor**,
 * hata verilmiyor: bir kurulum eski bir sürüme geri alındığında vitrinin
 * açılmaya devam etmesi, o bloğun görünmesinden önemli.
 */
function sanitize(key: PageKey, raw: unknown): PageBlock[] {
  if (!Array.isArray(raw)) return DEFAULTS[key].map((b) => ({ ...b }));
  const defs = PAGE_REGISTRY[key];
  const seen = new Set<string>();
  const blocks: PageBlock[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = (item as { type?: unknown }).type;
    if (typeof type !== "string" || !defs[type]) continue;
    // Aynı blok iki kez: ürün ızgarasını iki kez çizmek düzen değil, hata.
    if (seen.has(type)) continue;
    seen.add(type);
    blocks.push({
      type,
      params: coerceParams(defs[type]!, (item as { params?: unknown }).params),
      enabled: (item as { enabled?: unknown }).enabled !== false,
    });
  }

  // Zorunlu blok kayıttan düşmüşse geri konuyor — kaydı bozulmuş bir kurulum
  // ürünsüz bir vitrinle açılmamalı.
  for (const [type, def] of Object.entries(defs)) {
    if (def.required && !seen.has(type)) {
      blocks.push({
        type,
        params: coerceParams(def, undefined),
        enabled: true,
      });
    }
  }

  return blocks;
}

/** Bilinmeyen anahtarları at, tipleri zorla, eksikleri varsayılanla doldur. */
function coerceParams(def: BlockDef, raw: unknown): Record<string, unknown> {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const p of def.params) {
    const value = input[p.key];
    switch (p.type) {
      case "text":
        out[p.key] = typeof value === "string" ? value.slice(0, p.maxLength) : "";
        break;
      case "number": {
        const n = Number(value);
        out[p.key] = Number.isFinite(n) ? Math.min(p.max, Math.max(p.min, Math.trunc(n))) : p.min;
        break;
      }
      case "boolean":
        // Verilmemişse `true`: yeni eklenen bir ayar, eski kayıtlarda yok ve
        // varsayılanı "açık" olmalı — kapalı saymak, kimsenin kapatmadığı bir
        // özelliği sessizce kaldırırdı.
        out[p.key] = value === undefined ? true : Boolean(value);
        break;
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// YAZMA
// ─────────────────────────────────────────────

export async function savePageLayout(
  key: PageKey,
  input: PageLayoutInput,
  actorId: string,
): Promise<PageLayoutView> {
  const defs = PAGE_REGISTRY[key];
  if (!defs) {
    throw new BusinessError("PAGE_NOT_FOUND", "Bilinmeyen sayfa", { key });
  }

  const seen = new Set<string>();
  const blocks: PageBlock[] = [];
  for (const block of input.blocks) {
    const def = defs[block.type];
    // Kayıt defterinde olmayan tip **reddediliyor** (okurken atılıyordu):
    // yazma tarafında sessizce yutmak, kullanıcının eklediği bloğun kaybolması
    // ve sebebinin söylenmemesi demek.
    if (!def) {
      throw new BusinessError("INVALID_BLOCK", `Bilinmeyen blok: ${block.type}`, {
        type: block.type,
      });
    }
    if (seen.has(block.type)) {
      throw new BusinessError(
        "INVALID_BLOCK",
        `${def.label} bloğu bir sayfada birden fazla olamaz`,
        { type: block.type },
      );
    }
    if (def.required && block.enabled === false) {
      throw new BusinessError(
        "INVALID_BLOCK",
        `${def.label} kapatılamaz`,
        { type: block.type },
      );
    }
    seen.add(block.type);
    blocks.push({
      type: block.type,
      params: coerceParams(def, block.params),
      enabled: block.enabled,
    });
  }

  for (const [type, def] of Object.entries(defs)) {
    if (def.required && !seen.has(type)) {
      throw new BusinessError("INVALID_BLOCK", `${def.label} kaldırılamaz`, { type });
    }
  }

  // Json kolonuna yazarken açık dönüşüm: `PageBlock[]` bir arayüz ve Prisma'nın
  // `InputJsonValue`u dizin imzası istiyor. Değer zaten düz veri — dönüşüm
  // yalnızca tip tarafında.
  const stored = blocks as unknown as Prisma.InputJsonValue;

  const row = await prisma.pageLayout.upsert({
    where: { key },
    create: { key, blocks: stored, updatedById: actorId },
    update: { blocks: stored, updatedById: actorId },
    select: {
      blocks: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });

  return {
    key,
    blocks: sanitize(key, row.blocks),
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy?.name ?? null,
    isDefault: false,
  };
}

/** Kaydı sil — sayfa varsayılan düzene döner. */
export async function resetPageLayout(key: PageKey): Promise<PageLayoutView> {
  await prisma.pageLayout.deleteMany({ where: { key } });
  return getPageLayout(key);
}

export function isPageKey(value: string): value is PageKey {
  return PageKeyEnum.safeParse(value).success;
}
