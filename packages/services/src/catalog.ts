import { prisma, type Prisma } from "@repo/database";
import type { CustomCodeKey } from "@repo/types";
import { BusinessError } from "./errors";
import { customCodeWhere, listActiveCustomCodeFields } from "./custom-codes";
import { convertPriceRows, currentRates, type RateMap } from "./exchange-rate";
import { resolvePrice, type DiscountRow } from "./pricing";
import { qty } from "./quantity";
import { resolveVolumeDiscount, type ResolvedVolumeDiscount } from "./volume-discount";
import {
  availabilityOf,
  loadWarehouseAvailability,
  resolveOrderWarehouse,
  sellableIn,
  type OrderWarehouse,
  type WarehouseAvailability,
} from "./warehouse-stock";

// ── Company pricing context (loaded once per request) ──

export interface CompanyPricingContext {
  companyId: string;
  customerGroupId: string | null;
  discounts: DiscountRow[];
  /** The hacim rung in force, or null. Resolved once — it costs a query. */
  volumeDiscount: ResolvedVolumeDiscount | null;
  /**
   * Geçerli kurlar. Bağlamda duruyor çünkü 24 ürünlük bir katalog sayfası
   * aksi hâlde satır başına bir sorgu daha atardı — ve hepsinin aynı anın
   * kurunu kullanması, listede iki ürünün farklı kurdan görünmemesi demek.
   */
  rates: RateMap;
  /**
   * Bu müşterinin siparişinin düşeceği depo ("depo" modülü açıkken). Katalog
   * stoğu bu deponun satılabilir adedini gösterir: toplamı göstermek, sepette
   * "Samsun deposunda yetersiz stok" hatasıyla biten bir "stokta var" olurdu.
   */
  warehouse: OrderWarehouse | null;
}

export async function loadCompanyPricingContext(
  companyId: string,
): Promise<CompanyPricingContext> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      customerGroupId: true,
      volumeDiscountMode: true,
      volumeTierId: true,
      warehouseId: true,
      discounts: {
        select: {
          categoryId: true,
          productId: true,
          discountType: true,
          value: true,
        },
      },
    },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı", {
      companyId,
    });
  }
  const rates = await currentRates();
  const warehouse = await resolveOrderWarehouse(prisma, {
    companyWarehouseId: company.warehouseId,
    isSeller: false,
  });

  return {
    companyId: company.id,
    customerGroupId: company.customerGroupId,
    discounts: company.discounts,
    rates,
    warehouse,
    // Once per request, not once per line: the rung is a property of the
    // customer, and a catalogue page of 24 products would otherwise aggregate
    // the same turnover 24 times.
    volumeDiscount: await resolveVolumeDiscount(prisma, company),
  };
}

// ── Catalog listing (prices resolved for the company; money as strings) ──

export interface CatalogVariant {
  id: string;
  sku: string;
  barcode: string | null;
  color: string | null;
  size: string | null;
  unitsPerCase: number;
  moqUnits: number;
  stock: number;
  /** Satış birimi (ADET, KG, MT…); boşsa adet. */
  unit: string | null;
  /** Miktarın kaç ondalık alabildiği: 0 = tam sayı (adet), 3 = gram hassasiyetinde kilo. */
  quantityScale: number;
  /** Prices are null when the variant has no applicable price for this company. */
  unitPrice: string | null;
  discountPerUnit: string | null;
  netUnitPrice: string | null;
  /**
   * Fiyatın listelendiği para birimi. Tutarların hepsi **TL**; bu alan yalnızca
   * vitrinde "≈ 12,50 USD" notunu basmak için — müşteri dolarla anlaştıysa
   * hangi sayıdan çevrildiğini görmek istiyor.
   */
  listCurrency: string | null;
  listUnitPrice: string | null;
  /**
   * Paket birimleri (koli, palet), çarpana göre sıralı. Fiyatlar **bir paket**
   * için çözülmüş: paketin kendi fiyatı varsa o, yoksa taban fiyat × çarpan.
   * Sepete eklerken miktar yine taban birimde gönderilir (1 koli = factor).
   */
  units: CatalogVariantUnit[];
}

export interface CatalogVariantUnit {
  id: string;
  name: string;
  factor: number;
  barcode: string | null;
  /** Paket başına liste ve net fiyat; bu firma için fiyat yoksa null. */
  unitPrice: string | null;
  netUnitPrice: string | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  images: string[];
  vatRate: number;
  categoryId: string;
  variants: CatalogVariant[];
}

export interface ListCatalogParams {
  companyId: string;
  categoryId?: string;
  search?: string;
  /**
   * Özel kod süzgeci. Yalnızca "katalogda süzgeç olarak göster" işaretli aktif
   * yuvalar dikkate alınıyor, öbürleri sessizce yok sayılıyor — bkz.
   * `allowedCatalogCodes`.
   */
  codes?: Partial<Record<CustomCodeKey, string>>;
}

/**
 * Alıcının süzebileceği özel kodlar.
 *
 * Her yuva katalogda gösterilmiyor: "Tedarikçi" ya da "Raf" gibi iç kullanım
 * alanları da özel kod olabilir. Adresteki `kod5=…` süzgeci herhangi bir
 * yuvayı kabul etseydi, alıcı iç bir kodun değerini deneyerek hangi ürünlerin
 * ona karşılık geldiğini öğrenebilirdi. Bu yüzden süzgeç yalnızca ekranın
 * zaten gösterdiği yuvalarda çalışıyor.
 */
async function allowedCatalogCodes(
  codes: Partial<Record<CustomCodeKey, string>> | undefined,
): Promise<Partial<Record<CustomCodeKey, string>>> {
  if (!codes || Object.keys(codes).length === 0) return {};
  const shown = (await listActiveCustomCodeFields("PRODUCT"))
    .filter((f) => f.showInCatalogFilter)
    .map((f) => f.key);
  return Object.fromEntries(
    Object.entries(codes).filter(([k]) => shown.includes(k as CustomCodeKey)),
  ) as Partial<Record<CustomCodeKey, string>>;
}

/**
 * The columns every catalog surface needs. Shared so the list and the single
 * product page cannot drift into showing different fields for the same variant.
 */
const CATALOG_SELECT = {
  id: true,
  name: true,
  slug: true,
  brand: true,
  images: true,
  vatRate: true,
  categoryId: true,
  variants: {
    // Pasif varyant katalogda hiç görünmez. Satır silinmiyor çünkü geçmiş
    // siparişler ona bakıyor; ERP'de pasife çekilen kart burada da satılamaz
    // hâle gelmeli, aksi hâlde satılamayacak mal sipariş edilirdi.
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      barcode: true,
      color: true,
      size: true,
      unitsPerCase: true,
      moqUnits: true,
      stock: true,
      unit: true,
      quantityScale: true,
      pricingUnit: true,
      unitFactor: true,
      tracksLots: true,
      units: {
        where: { isActive: true },
        select: { id: true, name: true, factor: true, barcode: true },
        orderBy: { factor: "asc" },
      },
      prices: {
        select: {
          customerGroupId: true,
          unitId: true,
          minQuantity: true,
          price: true,
          currency: true,
        },
      },
    },
    orderBy: { sku: "asc" },
  },
} as const;

type CatalogRow = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  images: string[];
  vatRate: number;
  categoryId: string;
  variants: Array<{
    id: string;
    sku: string;
    barcode: string | null;
    color: string | null;
    size: string | null;
    unitsPerCase: number;
    moqUnits: Prisma.Decimal | number;
    stock: Prisma.Decimal | number;
    unit: string | null;
    quantityScale: number;
    pricingUnit: string | null;
    unitFactor: unknown;
    tracksLots: boolean;
    units: Array<{ id: string; name: string; factor: Prisma.Decimal; barcode: string | null }>;
    prices: Array<{
      customerGroupId: string | null;
      unitId: string | null;
      minQuantity: number;
      price: unknown;
    }>;
  }>;
};

/** One product row → the company's view of it, prices resolved. */
function toCatalogProduct(
  p: CatalogRow,
  ctx: CompanyPricingContext,
  stockIn: Map<string, WarehouseAvailability> | null,
): CatalogProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    images: p.images,
    vatRate: p.vatRate,
    categoryId: p.categoryId,
    variants: p.variants.map((v) => {
      const base = {
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        color: v.color,
        size: v.size,
        unitsPerCase: v.unitsPerCase,
        moqUnits: qty(v.moqUnits),
        // Depo modülünde müşterinin deposu; "sipariş alınmasın" kalem stoksuz
        // görünür — müşteriye "bu depodan satılmıyor" demenin sade hâli.
        stock: stockIn ? sellableIn(availabilityOf(stockIn, v.id)) : qty(v.stock),
        unit: v.unit,
        quantityScale: v.quantityScale,
        pricingUnit: v.pricingUnit,
        unitFactor: v.unitFactor ? String(v.unitFactor) : null,
        tracksLots: v.tracksLots,
      };
      // Döviz satırları fiyatlamadan önce TL'ye çevriliyor; iskonto ve KDV
      // tek para biriminde hesaplanıyor. Kuru girilmemiş para birimi bütün
      // kataloğu düşürmez: o kalem fiyatsız görünür (aşağıdaki catch).
      const pricesInLira = () =>
        convertPriceRows(
          v.prices as Array<{
            customerGroupId: string | null;
            unitId: string | null;
            minQuantity: number;
            price: Prisma.Decimal;
            currency?: string | null;
          }>,
          ctx.rates,
        );
      // Her paket bir paketlik miktarla fiyatlanır: "1 koli kaça".
      const units: CatalogVariantUnit[] = v.units.map((u) => {
        const unit = { id: u.id, name: u.name, factor: qty(u.factor), barcode: u.barcode };
        try {
          const r = resolvePrice({
            prices: pricesInLira(),
            customerGroupId: ctx.customerGroupId,
            quantity: qty(u.factor),
            productId: p.id,
            categoryId: p.categoryId,
            discounts: ctx.discounts,
            volumeDiscountPercent: ctx.volumeDiscount?.percent ?? null,
            unitFactor: v.unitFactor as Prisma.Decimal | null,
            unit: { id: u.id, factor: u.factor },
          });
          return {
            ...unit,
            unitPrice: r.package!.unitPrice.toFixed(2),
            netUnitPrice: r.package!.netUnitPrice.toFixed(2),
          };
        } catch {
          return { ...unit, unitPrice: null, netUnitPrice: null };
        }
      });
      try {
        const r = resolvePrice({
          prices: pricesInLira(),
          customerGroupId: ctx.customerGroupId,
          quantity: qty(v.moqUnits),
          productId: p.id,
          categoryId: p.categoryId,
          discounts: ctx.discounts,
          volumeDiscountPercent: ctx.volumeDiscount?.percent ?? null,
          unitFactor: v.unitFactor as import("@prisma/client").Prisma.Decimal | null,
        });
        return {
          ...base,
          unitPrice: r.unitPrice.toFixed(2),
          discountPerUnit: r.discountPerUnit.toFixed(2),
          netUnitPrice: r.netUnitPrice.toFixed(2),
          // Vitrinde "≈ 100 USD" notunu basabilmek için; tutarın kendisi TL.
          listCurrency: r.listCurrency,
          listUnitPrice: r.listUnitPrice.toFixed(2),
          units,
        };
      } catch {
        // No price defined for this company/variant → not orderable, priced null.
        return {
          ...base,
          unitPrice: null,
          discountPerUnit: null,
          netUnitPrice: null,
          listCurrency: null,
          listUnitPrice: null,
          units,
        };
      }
    }),
  };
}

export async function listCatalog(
  params: ListCatalogParams,
): Promise<CatalogProduct[]> {
  const ctx = await loadCompanyPricingContext(params.companyId);
  const codes = await allowedCatalogCodes(params.codes);

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      AND: customCodeWhere(codes),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: "insensitive" } },
              { brand: { contains: params.search, mode: "insensitive" } },
              // Müşteri elindeki SKU ya da barkodla arar; adı bilmesi gerekmez.
              {
                variants: {
                  some: {
                    OR: [
                      { sku: { contains: params.search, mode: "insensitive" } },
                      { barcode: { contains: params.search, mode: "insensitive" } },
                      // Koli/palet barkodu da aynı kaleme çıkar.
                      {
                        units: {
                          some: {
                            isActive: true,
                            barcode: { contains: params.search, mode: "insensitive" },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },
    select: CATALOG_SELECT,
    orderBy: { name: "asc" },
  });

  const stockIn = await warehouseStockFor(ctx, products);
  return products.map((p) => toCatalogProduct(p, ctx, stockIn));
}

/** Depo modülü açıksa listedeki kalemlerin o depodaki adedi; kapalıysa null. */
async function warehouseStockFor(
  ctx: CompanyPricingContext,
  products: ReadonlyArray<{ variants: ReadonlyArray<{ id: string }> }>,
): Promise<Map<string, WarehouseAvailability> | null> {
  if (!ctx.warehouse) return null;
  return loadWarehouseAvailability(
    prisma,
    ctx.warehouse.id,
    products.flatMap((p) => p.variants.map((v) => v.id)),
  );
}

/**
 * One product, priced for one company. Returns null when the product does not
 * exist or is not active — the caller renders a 404 rather than an error.
 */
export async function getCatalogProduct(
  productId: string,
  companyId: string,
): Promise<CatalogProduct | null> {
  const ctx = await loadCompanyPricingContext(companyId);
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
    select: CATALOG_SELECT,
  });
  if (!product) return null;
  return toCatalogProduct(product, ctx, await warehouseStockFor(ctx, [product]));
}

// ── Category tree ──

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children: CategoryNode[];
}

export async function listCategoryTree(): Promise<CategoryNode[]> {
  const cats = await prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true },
    orderBy: { name: "asc" },
  });

  const byId = new Map<string, CategoryNode>();
  for (const c of cats) {
    byId.set(c.id, { id: c.id, name: c.name, slug: c.slug, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const c of cats) {
    const node = byId.get(c.id)!;
    const parent = c.parentId ? byId.get(c.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
