import { prisma } from "@repo/database";
import type {
  CreateCategoryInput,
  CreateProductInput,
  CreateVariantInput,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateVariantInput,
} from "@repo/types";
import { BusinessError } from "./errors";
import { slugify, uniqueSlug } from "./slug";

// Catalog administration: the write side of what listCatalog() reads.
// Authorization (SUPER_ADMIN) is enforced at the route layer; these functions
// only guard data integrity.
//
// Deletion rule throughout: anything an order already references is never
// deleted — order history must keep pointing at real rows. Callers get IN_USE
// and are expected to deactivate (isActive=false) instead.

// ─────────────────────────────────────────────
// CATEGORY
// ─────────────────────────────────────────────

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  imageUrl: string | null;
  productCount: number;
  childCount: number;
}

export async function listCategoriesAdmin(): Promise<AdminCategoryRow[]> {
  const rows = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      imageUrl: true,
      _count: { select: { products: true, children: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parentId: c.parentId,
    imageUrl: c.imageUrl,
    productCount: c._count.products,
    childCount: c._count.children,
  }));
}

async function categorySlugTaken(slug: string, exceptId?: string) {
  const found = await prisma.category.findUnique({
    where: { slug },
    select: { id: true },
  });
  return !!found && found.id !== exceptId;
}

async function assertCategoryExists(id: string) {
  const found = await prisma.category.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!found) throw new BusinessError("CATEGORY_NOT_FOUND", "Kategori bulunamadı");
}

export async function createCategory(input: CreateCategoryInput) {
  if (input.parentId) await assertCategoryExists(input.parentId);

  const slug = await uniqueSlug(slugify(input.slug ?? input.name), (s) =>
    categorySlugTaken(s),
  );

  return prisma.category.create({
    data: {
      name: input.name,
      slug,
      parentId: input.parentId ?? null,
      imageUrl: input.imageUrl ?? null,
    },
    select: { id: true, name: true, slug: true, parentId: true },
  });
}

/** Walk up from `parentId`; if we meet `id`, the move would create a loop. */
async function assertNoCycle(id: string, parentId: string) {
  if (parentId === id) {
    throw new BusinessError("CATEGORY_CYCLE", "Kategori kendi altına taşınamaz");
  }
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === id) {
      throw new BusinessError(
        "CATEGORY_CYCLE",
        "Kategori kendi alt kategorisinin altına taşınamaz",
      );
    }
    if (seen.has(cursor)) break; // pre-existing loop in data; don't spin
    seen.add(cursor);
    const parent: { parentId: string | null } | null =
      await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
    cursor = parent?.parentId ?? null;
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  await assertCategoryExists(id);
  if (input.parentId) {
    await assertCategoryExists(input.parentId);
    await assertNoCycle(id, input.parentId);
  }

  const slug =
    input.slug || input.name
      ? await uniqueSlug(slugify(input.slug ?? input.name!), (s) =>
          categorySlugTaken(s, id),
        )
      : undefined;

  return prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug ? { slug } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId ?? null } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl ?? null } : {}),
    },
    select: { id: true, name: true, slug: true, parentId: true },
  });
}

export async function deleteCategory(id: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      _count: { select: { children: true, products: true, discounts: true } },
    },
  });
  if (!category) {
    throw new BusinessError("CATEGORY_NOT_FOUND", "Kategori bulunamadı");
  }
  if (category._count.children > 0) {
    throw new BusinessError(
      "CATEGORY_HAS_CHILDREN",
      "Alt kategorileri olan bir kategori silinemez",
    );
  }
  if (category._count.products > 0) {
    throw new BusinessError(
      "CATEGORY_IN_USE",
      "Ürünü olan bir kategori silinemez",
    );
  }
  if (category._count.discounts > 0) {
    throw new BusinessError(
      "CATEGORY_IN_USE",
      "Firma iskontosu tanımlı bir kategori silinemez",
    );
  }
  await prisma.category.delete({ where: { id } });
}

// ─────────────────────────────────────────────
// PRODUCT
// ─────────────────────────────────────────────

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  vatRate: number;
  isActive: boolean;
  category: { id: string; name: string };
  variantCount: number;
  totalStock: number;
  /** Variants with no price row at all — they cannot be ordered by anyone. */
  unpricedVariants: number;
}

export interface ListProductsParams {
  search?: string;
  categoryId?: string;
  /** Admin lists show archived products too unless asked otherwise. */
  onlyActive?: boolean;
}

export async function listProductsAdmin(
  params: ListProductsParams = {},
): Promise<AdminProductRow[]> {
  const products = await prisma.product.findMany({
    where: {
      ...(params.onlyActive ? { isActive: true } : {}),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: "insensitive" as const } },
              { brand: { contains: params.search, mode: "insensitive" as const } },
              {
                variants: {
                  some: {
                    sku: { contains: params.search, mode: "insensitive" as const },
                  },
                },
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      brand: true,
      vatRate: true,
      isActive: true,
      category: { select: { id: true, name: true } },
      variants: {
        select: { stock: true, _count: { select: { prices: true } } },
      },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    vatRate: p.vatRate,
    isActive: p.isActive,
    category: p.category,
    variantCount: p.variants.length,
    totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
    unpricedVariants: p.variants.filter((v) => v._count.prices === 0).length,
  }));
}

export interface AdminPriceRow {
  id: string;
  customerGroupId: string | null;
  customerGroupName: string | null;
  minQuantity: number;
  price: string;
  currency: string;
}

export interface AdminVariantDetail {
  id: string;
  sku: string;
  barcode: string | null;
  color: string | null;
  size: string | null;
  unitsPerCase: number;
  moqUnits: number;
  stock: number;
  weightGram: number | null;
  /** How many order lines reference this variant — non-zero blocks deletion. */
  orderItemCount: number;
  prices: AdminPriceRow[];
}

export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  images: string[];
  vatRate: number;
  isActive: boolean;
  categoryId: string;
  variants: AdminVariantDetail[];
}

export async function getProductAdmin(id: string): Promise<AdminProductDetail> {
  const p = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      brand: true,
      images: true,
      vatRate: true,
      isActive: true,
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
          weightGram: true,
          _count: { select: { orderItems: true } },
          prices: {
            select: {
              id: true,
              customerGroupId: true,
              customerGroup: { select: { name: true } },
              minQuantity: true,
              price: true,
              currency: true,
            },
            orderBy: [{ customerGroupId: "asc" }, { minQuantity: "asc" }],
          },
        },
        orderBy: { sku: "asc" },
      },
    },
  });
  if (!p) throw new BusinessError("PRODUCT_NOT_FOUND", "Ürün bulunamadı");

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    brand: p.brand,
    images: p.images,
    vatRate: p.vatRate,
    isActive: p.isActive,
    categoryId: p.categoryId,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode,
      color: v.color,
      size: v.size,
      unitsPerCase: v.unitsPerCase,
      moqUnits: v.moqUnits,
      stock: v.stock,
      weightGram: v.weightGram,
      orderItemCount: v._count.orderItems,
      prices: v.prices.map((pr) => ({
        id: pr.id,
        customerGroupId: pr.customerGroupId,
        customerGroupName: pr.customerGroup?.name ?? null,
        minQuantity: pr.minQuantity,
        price: pr.price.toFixed(2),
        currency: pr.currency,
      })),
    })),
  };
}

async function productSlugTaken(slug: string, exceptId?: string) {
  const found = await prisma.product.findUnique({
    where: { slug },
    select: { id: true },
  });
  return !!found && found.id !== exceptId;
}

export async function createProduct(input: CreateProductInput) {
  await assertCategoryExists(input.categoryId);

  const slug = await uniqueSlug(slugify(input.slug ?? input.name), (s) =>
    productSlugTaken(s),
  );

  return prisma.product.create({
    data: {
      name: input.name,
      slug,
      description: input.description ?? null,
      brand: input.brand ?? null,
      images: input.images,
      vatRate: input.vatRate,
      categoryId: input.categoryId,
      isActive: input.isActive,
    },
    select: { id: true, name: true, slug: true },
  });
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new BusinessError("PRODUCT_NOT_FOUND", "Ürün bulunamadı");
  if (input.categoryId) await assertCategoryExists(input.categoryId);

  const slug =
    input.slug || input.name
      ? await uniqueSlug(slugify(input.slug ?? input.name!), (s) =>
          productSlugTaken(s, id),
        )
      : undefined;

  return prisma.product.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug ? { slug } : {}),
      ...(input.description !== undefined
        ? { description: input.description ?? null }
        : {}),
      ...(input.brand !== undefined ? { brand: input.brand ?? null } : {}),
      ...(input.images !== undefined ? { images: input.images } : {}),
      ...(input.vatRate !== undefined ? { vatRate: input.vatRate } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: { id: true, name: true, slug: true, isActive: true },
  });
}

/**
 * Hard-delete a product and its variants. Refused once any order references a
 * variant — deactivate the product instead (isActive=false) so history stays intact.
 */
export async function deleteProduct(id: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      variants: { select: { _count: { select: { orderItems: true, cartItems: true } } } },
    },
  });
  if (!product) throw new BusinessError("PRODUCT_NOT_FOUND", "Ürün bulunamadı");

  const referenced = product.variants.some(
    (v) => v._count.orderItems > 0 || v._count.cartItems > 0,
  );
  if (referenced) {
    throw new BusinessError(
      "IN_USE",
      "Siparişlerde kullanılan ürün silinemez — ürünü pasife alın",
    );
  }
  // Variants (and their prices) cascade from Product.
  await prisma.product.delete({ where: { id } });
}

// ─────────────────────────────────────────────
// VARIANT
// ─────────────────────────────────────────────

async function assertSkuFree(sku: string, exceptId?: string) {
  const found = await prisma.productVariant.findUnique({
    where: { sku },
    select: { id: true },
  });
  if (found && found.id !== exceptId) {
    throw new BusinessError("DUPLICATE_SKU", `"${sku}" SKU'su zaten kullanılıyor`);
  }
}

async function assertBarcodeFree(barcode: string, exceptId?: string) {
  const found = await prisma.productVariant.findUnique({
    where: { barcode },
    select: { id: true },
  });
  if (found && found.id !== exceptId) {
    throw new BusinessError(
      "DUPLICATE_BARCODE",
      `"${barcode}" barkodu zaten kullanılıyor`,
    );
  }
}

export async function createVariant(productId: string, input: CreateVariantInput) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw new BusinessError("PRODUCT_NOT_FOUND", "Ürün bulunamadı");

  await assertSkuFree(input.sku);
  if (input.barcode) await assertBarcodeFree(input.barcode);

  return prisma.productVariant.create({
    data: {
      productId,
      sku: input.sku,
      barcode: input.barcode ?? null,
      color: input.color ?? null,
      size: input.size ?? null,
      unitsPerCase: input.unitsPerCase,
      moqUnits: input.moqUnits,
      stock: input.stock,
      weightGram: input.weightGram ?? null,
    },
    select: { id: true, sku: true },
  });
}

export async function updateVariant(id: string, input: UpdateVariantInput) {
  const existing = await prisma.productVariant.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new BusinessError("VARIANT_NOT_FOUND", "Varyant bulunamadı");
  }
  if (input.sku) await assertSkuFree(input.sku, id);
  if (input.barcode) await assertBarcodeFree(input.barcode, id);

  return prisma.productVariant.update({
    where: { id },
    data: {
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode ?? null } : {}),
      ...(input.color !== undefined ? { color: input.color ?? null } : {}),
      ...(input.size !== undefined ? { size: input.size ?? null } : {}),
      ...(input.unitsPerCase !== undefined
        ? { unitsPerCase: input.unitsPerCase }
        : {}),
      ...(input.moqUnits !== undefined ? { moqUnits: input.moqUnits } : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
      ...(input.weightGram !== undefined
        ? { weightGram: input.weightGram ?? null }
        : {}),
    },
    select: { id: true, sku: true, stock: true },
  });
}

export async function deleteVariant(id: string): Promise<void> {
  const variant = await prisma.productVariant.findUnique({
    where: { id },
    select: { _count: { select: { orderItems: true, cartItems: true } } },
  });
  if (!variant) {
    throw new BusinessError("VARIANT_NOT_FOUND", "Varyant bulunamadı");
  }
  if (variant._count.orderItems > 0 || variant._count.cartItems > 0) {
    throw new BusinessError(
      "IN_USE",
      "Siparişlerde kullanılan varyant silinemez — stoğunu sıfırlayın",
    );
  }
  // Price rows cascade from ProductVariant.
  await prisma.productVariant.delete({ where: { id } });
}
