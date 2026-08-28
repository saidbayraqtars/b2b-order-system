import { createHash } from "node:crypto";
import { prisma } from "@repo/database";
import { BusinessError } from "./errors";
import { postStockMovement } from "./stock-ledger";
import { parseDecimal, readSpreadsheet, type SheetRow } from "./xlsx-read";

// Excel ile toplu fiyat ve stok güncelleme.
//
// XLSX **yazıcı** Adım 58'de gelmişti; okuyucu yoktu ve simetrisi eksikti.
// Gerçek bir müşteri 2673 varyanta dört ayrı fiyatı ekrandan tek tek giremez,
// ve toptancıda zam ayda bir, toplu gelir.
//
// ── Değiştirilemez kural ───────────────────────────────────────────────────
// **Fark önizlemesi olmadan uygulama yok.** Bir dosyayı doğrudan uygulamak,
// yanlış sütuna kaymış bir kopyalamanın bütün kataloğu bir kuruşa satması
// demek. Akış tek yönlü:
//
//     dışa aktar → Excel'de düzelt → içe aktar → FARK ÖNİZLEMESİ → onayla → uygula
//
// Önizleme ile uygulama arasındaki bağ bir **imza**: sunucu farkı hesaplayıp
// özetini imzalıyor, uygulama isteği o imzayı geri gönderiyor ve sunucu farkı
// yeniden hesaplayıp imzayı karşılaştırıyor. Uymuyorsa uygulama reddediliyor —
// çünkü uymaması, ya dosyanın ya da veritabanının önizlemeden sonra değiştiği
// anlamına gelir. İmzasız bir "uygula" ucu, önizlemeyi bir öneriye çevirirdi.

export type ImportKind = "PRICE" | "STOCK";

export type RowStatus =
  | "update"
  | "create"
  | "unchanged"
  | "unknown-sku"
  | "unknown-group"
  | "invalid";

export interface PriceRowPlan {
  line: number;
  sku: string;
  productName: string | null;
  groupName: string | null;
  groupId: string | null;
  minQuantity: number;
  currentPrice: number | null;
  newPrice: number | null;
  status: RowStatus;
  message?: string;
}

export interface StockRowPlan {
  line: number;
  sku: string;
  productName: string | null;
  currentStock: number | null;
  countedStock: number | null;
  difference: number | null;
  status: RowStatus;
  message?: string;
}

export interface ImportPlan {
  kind: ImportKind;
  /** Farkın imzası; uygulama isteği bunu geri gönderiyor. */
  signature: string;
  counts: Record<RowStatus, number>;
  priceRows?: PriceRowPlan[];
  stockRows?: StockRowPlan[];
  /** Ekranda gösterilen satır sayısı sınırlandıysa toplam. */
  totalRows: number;
}

/** Bir seferde işlenecek en fazla satır. */
const MAX_ROWS = 5000;

/** Önizlemede çizilen en fazla satır; imza satırların tamamından çıkıyor. */
const PREVIEW_ROWS = 300;

const EMPTY_COUNTS: Record<RowStatus, number> = {
  update: 0,
  create: 0,
  unchanged: 0,
  "unknown-sku": 0,
  "unknown-group": 0,
  invalid: 0,
};

// ─────────────────────────────────────────────
// BAŞLIK EŞLEME
// ─────────────────────────────────────────────

/**
 * Sütunlar **ada göre** bulunuyor, sıraya göre değil.
 *
 * Kullanıcı Excel'de sütun taşıyor, siliyor, araya kolon ekliyor. Sıraya
 * güvenmek, "yanlış sütuna kaymış kopyalama" felaketinin tam da kendisi olurdu.
 * Ad eşleşmesi büyük/küçük harf ve Türkçe karakterden bağımsız.
 */
function normalizeHeader(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

const PRICE_HEADERS = {
  sku: ["sku", "stokkodu", "urunkodu", "kod"],
  group: ["grup", "musterigrubu", "fiyatgrubu"],
  minQuantity: ["minadet", "minimumadet", "adet", "kademe"],
  price: ["fiyat", "birimfiyat", "yenifiyat", "listefiyati"],
} as const;

const STOCK_HEADERS = {
  sku: ["sku", "stokkodu", "urunkodu", "kod"],
  counted: ["sayilanstok", "stok", "sayim", "adet", "yenistok"],
} as const;

function findColumns<T extends Record<string, readonly string[]>>(
  header: SheetRow,
  spec: T,
): Record<keyof T, number> {
  const normalized = header.map((h) =>
    h === null ? "" : normalizeHeader(String(h)),
  );
  const out = {} as Record<keyof T, number>;
  for (const key of Object.keys(spec) as Array<keyof T>) {
    out[key] = normalized.findIndex((h) => spec[key]!.includes(h));
  }
  return out;
}

// ─────────────────────────────────────────────
// PLAN
// ─────────────────────────────────────────────

/**
 * Planın tamamı — her satır, kesilmeden.
 *
 * Önizleme bunu kesiyor, uygulama kesmiyor. İkisinin aynı fonksiyondan
 * çıkması şart: uygulama, önizlemenin gösterdiğinden başka bir plan
 * kurabilseydi imza kontrolünün bir anlamı kalmazdı.
 */
async function buildPlan(kind: ImportKind, file: Buffer): Promise<ImportPlan> {
  const rows = readSpreadsheet(file);
  if (rows.length === 0) {
    throw new BusinessError("INVALID_IMPORT", "Dosya boş.");
  }
  if (rows.length - 1 > MAX_ROWS) {
    throw new BusinessError(
      "INVALID_IMPORT",
      `Dosyada ${rows.length - 1} satır var; bir seferde en fazla ${MAX_ROWS} satır işlenebilir.`,
    );
  }
  return kind === "PRICE" ? planPrices(rows) : planStock(rows);
}

/** Ekrana giden plan: satırlar `PREVIEW_ROWS`ta kesiliyor, imza kesilmiyor. */
export async function planImport(
  kind: ImportKind,
  file: Buffer,
): Promise<ImportPlan> {
  const plan = await buildPlan(kind, file);
  return {
    ...plan,
    priceRows: plan.priceRows?.slice(0, PREVIEW_ROWS),
    stockRows: plan.stockRows?.slice(0, PREVIEW_ROWS),
  };
}

async function planPrices(rows: SheetRow[]): Promise<ImportPlan> {
  const header = rows[0]!;
  const col = findColumns(header, PRICE_HEADERS);
  if (col.sku < 0 || col.price < 0) {
    throw new BusinessError(
      "INVALID_IMPORT",
      "Başlık satırında 'SKU' ve 'Fiyat' sütunları bulunamadı. Şablonu indirip üzerine yazmak en kısa yol.",
    );
  }

  const body = rows.slice(1).filter((r) => r.some((c) => c !== null));
  const skus = [
    ...new Set(
      body
        .map((r) => cellText(r[col.sku] ?? null))
        .filter((s): s is string => s !== null),
    ),
  ];

  const [variants, groups] = await Promise.all([
    prisma.productVariant.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true, product: { select: { name: true } } },
    }),
    prisma.customerGroup.findMany({ select: { id: true, name: true } }),
  ]);

  const bySku = new Map(variants.map((v) => [v.sku, v]));
  const byGroup = new Map(
    groups.map((g) => [normalizeHeader(g.name), g]),
  );

  // Mevcut fiyatlar tek sorguda: satır başına sorgu, beş bin satırlık bir
  // dosyada beş bin gidiş-dönüş demek olurdu.
  const existing = await prisma.price.findMany({
    where: { variantId: { in: variants.map((v) => v.id) } },
    select: {
      variantId: true,
      customerGroupId: true,
      minQuantity: true,
      price: true,
    },
  });
  const priceKey = (
    variantId: string,
    groupId: string | null,
    minQuantity: number,
  ) => `${variantId}|${groupId ?? ""}|${minQuantity}`;
  const currentPrices = new Map(
    existing.map((p) => [
      priceKey(p.variantId, p.customerGroupId, p.minQuantity),
      Number(p.price),
    ]),
  );

  const counts = { ...EMPTY_COUNTS };
  const plans: PriceRowPlan[] = body.map((row, i) => {
    const line = i + 2; // başlık 1. satır
    const sku = cellText(row[col.sku] ?? null);
    const groupText = col.group >= 0 ? cellText(row[col.group] ?? null) : null;
    const minQuantity =
      col.minQuantity >= 0
        ? Math.max(1, Math.trunc(parseDecimal(row[col.minQuantity] ?? null) ?? 1))
        : 1;
    const newPrice = parseDecimal(row[col.price] ?? null);

    const base: PriceRowPlan = {
      line,
      sku: sku ?? "",
      productName: null,
      groupName: groupText,
      groupId: null,
      minQuantity,
      currentPrice: null,
      newPrice,
      status: "invalid",
    };

    if (!sku) return withCount(counts, { ...base, message: "SKU boş" });

    const variant = bySku.get(sku);
    if (!variant) {
      return withCount(counts, {
        ...base,
        status: "unknown-sku",
        message: "Bu SKU katalogda yok",
      });
    }
    base.productName = variant.product.name;

    let groupId: string | null = null;
    if (groupText) {
      const group = byGroup.get(normalizeHeader(groupText));
      if (!group) {
        return withCount(counts, {
          ...base,
          status: "unknown-group",
          message: "Bu müşteri grubu yok",
        });
      }
      groupId = group.id;
    }
    base.groupId = groupId;

    if (newPrice === null || newPrice < 0) {
      return withCount(counts, { ...base, message: "Fiyat okunamadı" });
    }

    const current =
      currentPrices.get(priceKey(variant.id, groupId, minQuantity)) ?? null;
    base.currentPrice = current;

    if (current === null) {
      return withCount(counts, { ...base, status: "create" });
    }
    // Kuruş farkı bir değişikliktir; iki ondalıkta karşılaştırılıyor çünkü
    // Decimal'in dizgi hâli 129.90 ile 129.9'u ayırır ve o bir fark değil.
    if (Math.abs(current - newPrice) < 0.005) {
      return withCount(counts, { ...base, status: "unchanged" });
    }
    return withCount(counts, { ...base, status: "update" });
  });

  return {
    kind: "PRICE",
    signature: sign("PRICE", plans),
    counts,
    priceRows: plans,
    totalRows: plans.length,
  };
}

async function planStock(rows: SheetRow[]): Promise<ImportPlan> {
  const header = rows[0]!;
  const col = findColumns(header, STOCK_HEADERS);
  if (col.sku < 0 || col.counted < 0) {
    throw new BusinessError(
      "INVALID_IMPORT",
      "Başlık satırında 'SKU' ve 'Sayılan stok' sütunları bulunamadı.",
    );
  }

  const body = rows.slice(1).filter((r) => r.some((c) => c !== null));
  const skus = [
    ...new Set(
      body.map((r) => cellText(r[col.sku] ?? null)).filter((s): s is string => s !== null),
    ),
  ];
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true, stock: true, product: { select: { name: true } } },
  });
  const bySku = new Map(variants.map((v) => [v.sku, v]));

  const counts = { ...EMPTY_COUNTS };
  const plans: StockRowPlan[] = body.map((row, i) => {
    const line = i + 2;
    const sku = cellText(row[col.sku] ?? null);
    const counted = parseDecimal(row[col.counted] ?? null);

    const base: StockRowPlan = {
      line,
      sku: sku ?? "",
      productName: null,
      currentStock: null,
      countedStock: counted === null ? null : Math.trunc(counted),
      difference: null,
      status: "invalid",
    };

    if (!sku) return withCount(counts, { ...base, message: "SKU boş" });

    const variant = bySku.get(sku);
    if (!variant) {
      return withCount(counts, {
        ...base,
        status: "unknown-sku",
        message: "Bu SKU katalogda yok",
      });
    }
    base.productName = variant.product.name;
    base.currentStock = variant.stock;

    if (base.countedStock === null || base.countedStock < 0) {
      return withCount(counts, { ...base, message: "Sayılan adet okunamadı" });
    }

    base.difference = base.countedStock - variant.stock;
    if (base.difference === 0) {
      return withCount(counts, { ...base, status: "unchanged" });
    }
    return withCount(counts, { ...base, status: "update" });
  });

  return {
    kind: "STOCK",
    signature: sign("STOCK", plans),
    counts,
    stockRows: plans,
    totalRows: plans.length,
  };
}

function withCount<T extends { status: RowStatus }>(
  counts: Record<RowStatus, number>,
  row: T,
): T {
  counts[row.status] += 1;
  return row;
}

function cellText(value: string | number | null): string | null {
  if (value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/**
 * Farkın imzası.
 *
 * Yalnızca **uygulanacak** satırlardan çıkıyor: değişmeyen satırlar ya da
 * tanınmayan SKU'lar imzayı etkilemiyor, çünkü onlar uygulanmıyor. İçinde
 * mevcut değer de var — yani araya başka biri girip fiyatı değiştirirse imza
 * tutmuyor ve uygulama reddediliyor.
 */
function sign(kind: ImportKind, rows: Array<PriceRowPlan | StockRowPlan>): string {
  const payload = rows
    .filter((r) => r.status === "update" || r.status === "create")
    .map((r) =>
      "newPrice" in r
        ? `${r.sku}|${r.groupId ?? ""}|${r.minQuantity}|${r.currentPrice ?? ""}|${r.newPrice}`
        : `${r.sku}|${r.currentStock}|${r.countedStock}`,
    )
    .join("\n");
  return createHash("sha256").update(`${kind}\n${payload}`).digest("hex");
}

// ─────────────────────────────────────────────
// UYGULAMA
// ─────────────────────────────────────────────

export interface ImportResult {
  applied: number;
  skipped: number;
  kind: ImportKind;
}

export async function applyImport(
  kind: ImportKind,
  file: Buffer,
  signature: string,
  actorId: string,
): Promise<ImportResult> {
  // Fark **yeniden** hesaplanıyor. İstemcinin gönderdiği plana güvenmek,
  // önizlemeyi bir öneriye çevirirdi: aynı imzayla farklı satırlar
  // gönderilebilirdi.
  const plan = await buildPlan(kind, file);
  if (plan.signature !== signature) {
    throw new BusinessError(
      "STALE_IMPORT",
      "Önizlemeden sonra veriler değişti (dosya ya da fiyatlar). Önizlemeyi yenileyip tekrar onaylayın.",
    );
  }

  return kind === "PRICE"
    ? applyPrices(plan)
    : applyStock(plan, actorId);
}

async function applyPrices(plan: ImportPlan): Promise<ImportResult> {
  const targets = (plan.priceRows ?? []).filter(
    (r) => r.status === "update" || r.status === "create",
  );

  // Varyant kimlikleri **tek sorguda**: satır başına bir `findUnique`, beş bin
  // satırlık bir dosyada beş bin gidiş-dönüş demek olurdu ve hepsi tek bir
  // işlemin içinde, yani kilit tutarak.
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: [...new Set(targets.map((r) => r.sku))] } },
    select: { id: true, sku: true },
  });
  const idBySku = new Map(variants.map((v) => [v.sku, v.id]));

  // Tek işlem: yarısı uygulanmış bir zam listesi, hiç uygulanmamış olandan
  // çok daha pahalı — hangi ürünün hangi fiyattan satıldığı belirsiz kalır.
  await prisma.$transaction(
    async (tx) => {
      for (const row of targets) {
        const variantId = idBySku.get(row.sku);
        if (!variantId) continue;

        const existing = await tx.price.findFirst({
          where: {
            variantId,
            customerGroupId: row.groupId,
            minQuantity: row.minQuantity,
          },
          select: { id: true },
        });

        if (existing) {
          await tx.price.update({
            where: { id: existing.id },
            data: { price: row.newPrice! },
          });
        } else {
          await tx.price.create({
            data: {
              variantId,
              customerGroupId: row.groupId,
              minQuantity: row.minQuantity,
              price: row.newPrice!,
            },
          });
        }
      }
    },
    // Beş bin satır varsayılan beş saniyeye sığmıyor.
    { timeout: 120_000 },
  );

  return {
    kind: "PRICE",
    applied: targets.length,
    skipped: plan.totalRows - targets.length,
  };
}

/**
 * Stok **defterden** geçiyor.
 *
 * `stock` kolonuna doğrudan yazmak Adım 51'in tek kapı kuralını çiğnerdi:
 * eldeki adet o defterin bakiyesi ve her hareket iz bırakmak zorunda. İçe
 * aktarma bir **sayım** (`COUNT`): farkı kadar giriş ya da çıkış yazıyor.
 */
async function applyStock(
  plan: ImportPlan,
  actorId: string,
): Promise<ImportResult> {
  const targets = (plan.stockRows ?? []).filter((r) => r.status === "update");

  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: [...new Set(targets.map((r) => r.sku))] } },
    select: { id: true, sku: true },
  });
  const idBySku = new Map(variants.map((v) => [v.sku, v.id]));

  await prisma.$transaction(
    async (tx) => {
      for (const row of targets) {
        const variantId = idBySku.get(row.sku);
        if (!variantId || !row.difference) continue;

        await postStockMovement(tx, {
          variantId,
          direction: row.difference > 0 ? "IN" : "OUT",
          quantity: Math.abs(row.difference),
          source: "COUNT",
          description: `Excel ile toplu sayım: ${row.currentStock} → ${row.countedStock}`,
          recordedById: actorId,
        });
      }
    },
    { timeout: 120_000 },
  );

  return {
    kind: "STOCK",
    applied: targets.length,
    skipped: plan.totalRows - targets.length,
  };
}

// ─────────────────────────────────────────────
// ŞABLON
// ─────────────────────────────────────────────

export interface TemplateRow {
  sku: string;
  productName: string;
  groupName: string | null;
  minQuantity: number;
  price: number | null;
  stock: number;
}

/**
 * Dışa aktarılan şablon — akışın ilk adımı.
 *
 * Boş bir şablon yerine **mevcut hâl** veriliyor: kullanıcı üzerine yazacak,
 * sıfırdan doldurmayacak. Fiyatı olmayan varyant da listede, çünkü asıl iş
 * çoğu zaman eksikleri doldurmak.
 */
export async function importTemplateRows(
  kind: ImportKind,
): Promise<TemplateRow[]> {
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true, product: { isActive: true } },
    select: {
      sku: true,
      stock: true,
      product: { select: { name: true } },
      prices: {
        select: {
          price: true,
          minQuantity: true,
          customerGroup: { select: { name: true } },
        },
        orderBy: [{ customerGroupId: "asc" }, { minQuantity: "asc" }],
      },
    },
    orderBy: { sku: "asc" },
    take: MAX_ROWS,
  });

  const out: TemplateRow[] = [];
  for (const v of variants) {
    if (kind === "STOCK") {
      out.push({
        sku: v.sku,
        productName: v.product.name,
        groupName: null,
        minQuantity: 1,
        price: null,
        stock: v.stock,
      });
      continue;
    }
    if (v.prices.length === 0) {
      out.push({
        sku: v.sku,
        productName: v.product.name,
        groupName: null,
        minQuantity: 1,
        price: null,
        stock: v.stock,
      });
      continue;
    }
    for (const p of v.prices) {
      out.push({
        sku: v.sku,
        productName: v.product.name,
        groupName: p.customerGroup?.name ?? null,
        minQuantity: p.minQuantity,
        price: Number(p.price),
        stock: v.stock,
      });
    }
  }
  return out;
}
