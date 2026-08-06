import { prisma } from "@repo/database";
import { BusinessError } from "./errors";
import { resolvePrice, type DiscountRow } from "./pricing";
import { resolveVolumeDiscount, type ResolvedVolumeDiscount } from "./volume-discount";

// ── Company pricing context (loaded once per request) ──

export interface CompanyPricingContext {
  companyId: string;
  customerGroupId: string | null;
  discounts: DiscountRow[];
  /** The hacim rung in force, or null. Resolved once — it costs a query. */
  volumeDiscount: ResolvedVolumeDiscount | null;
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
  return {
    companyId: company.id,
    customerGroupId: company.customerGroupId,
    discounts: company.discounts,
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
  /** Prices are null when the variant has no applicable price for this company. */
  unitPrice: string | null;
  discountPerUnit: string | null;
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
    select: {
      id: true,
      sku: true,
      barcode: true,
      color: true,
      size: true,
      unitsPerCase: true,
      moqUnits: true,
      stock: true,
      prices: {
        select: {
          customerGroupId: true,
          minQuantity: true,
          price: true,
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
    moqUnits: number;
    stock: number;
    prices: Array<{
      customerGroupId: string | null;
      minQuantity: number;
      price: unknown;
    }>;
  }>;
};

/** One product row → the company's view of it, prices resolved. */
function toCatalogProduct(
  p: CatalogRow,
  ctx: CompanyPricingContext,
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
        moqUnits: v.moqUnits,
        stock: v.stock,
      };
      try {
        const r = resolvePrice({
          prices: v.prices as Parameters<typeof resolvePrice>[0]["prices"],
          customerGroupId: ctx.customerGroupId,
          quantity: v.moqUnits,
          productId: p.id,
          categoryId: p.categoryId,
          discounts: ctx.discounts,
          volumeDiscountPercent: ctx.volumeDiscount?.percent ?? null,
        });
        return {
          ...base,
          unitPrice: r.unitPrice.toFixed(2),
          discountPerUnit: r.discountPerUnit.toFixed(2),
          netUnitPrice: r.netUnitPrice.toFixed(2),
        };
      } catch {
        // No price defined for this company/variant → not orderable, priced null.
        return { ...base, unitPrice: null, discountPerUnit: null, netUnitPrice: null };
      }
    }),
  };
}

export async function listCatalog(
  params: ListCatalogParams,
): Promise<CatalogProduct[]> {
  const ctx = await loadCompanyPricingContext(params.companyId);

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
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

  return products.map((p) => toCatalogProduct(p, ctx));
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
  return product ? toCatalogProduct(product, ctx) : null;
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
