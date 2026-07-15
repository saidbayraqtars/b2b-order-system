import { prisma } from "@repo/database";
import { BusinessError } from "./errors";
import { resolvePrice, type DiscountRow } from "./pricing";

// ── Company pricing context (loaded once per request) ──

export interface CompanyPricingContext {
  companyId: string;
  customerGroupId: string | null;
  discounts: DiscountRow[];
}

export async function loadCompanyPricingContext(
  companyId: string,
): Promise<CompanyPricingContext> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      customerGroupId: true,
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

export async function listCatalog(
  params: ListCatalogParams,
): Promise<CatalogProduct[]> {
  const ctx = await loadCompanyPricingContext(params.companyId);

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.search
        ? { name: { contains: params.search, mode: "insensitive" } }
        : {}),
    },
    select: {
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
    },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
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
          prices: v.prices,
          customerGroupId: ctx.customerGroupId,
          quantity: v.moqUnits,
          productId: p.id,
          categoryId: p.categoryId,
          discounts: ctx.discounts,
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
  }));
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
