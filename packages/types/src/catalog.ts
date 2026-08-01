import { z } from "zod";
import { DiscountTypeEnum } from "./enums";

// Admin-side catalog input contracts. Slugs are optional everywhere — the
// service derives one from the name when omitted, so the UI never has to.

/** TR VAT rates. Anything else is a data-entry mistake, not a business case. */
export const VAT_RATES = [1, 10, 20] as const;

const slug = z
  .string()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug yalnızca küçük harf, rakam ve tire içerebilir");

// ── Category ──

export const createCategorySchema = z.object({
  name: z.string().min(1, "Kategori adı gerekli").max(120),
  slug: slug.optional(),
  parentId: z.string().cuid().nullish(),
  imageUrl: z.string().url("Geçerli bir URL girin").nullish(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ── Product ──

export const createProductSchema = z.object({
  name: z.string().min(1, "Ürün adı gerekli").max(200),
  slug: slug.optional(),
  description: z.string().max(5000).nullish(),
  brand: z.string().max(120).nullish(),
  images: z.array(z.string().url("Geçerli bir görsel URL'i girin")).default([]),
  vatRate: z
    .number()
    .int()
    .refine((v) => (VAT_RATES as readonly number[]).includes(v), "KDV oranı 1, 10 veya 20 olmalı")
    .default(20),
  categoryId: z.string().cuid("Kategori seçin"),
  isActive: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ── Variant ──

export const createVariantSchema = z.object({
  sku: z.string().min(1, "SKU gerekli").max(64),
  barcode: z.string().max(64).nullish(),
  color: z.string().max(60).nullish(),
  size: z.string().max(60).nullish(),
  unitsPerCase: z.number().int().positive("Koli adedi en az 1 olmalı").default(1),
  moqUnits: z.number().int().positive("Minimum sipariş en az 1 olmalı").default(1),
  stock: z.number().int().min(0, "Stok negatif olamaz").default(0),
  weightGram: z.number().int().positive().nullish(),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = createVariantSchema.partial();
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

// ── Price tier ──

export const upsertPriceSchema = z.object({
  /** null = default list price (applies to companies with no group price). */
  customerGroupId: z.string().cuid().nullish(),
  minQuantity: z.number().int().positive("Miktar kademesi en az 1 olmalı").default(1),
  price: z.number().nonnegative("Fiyat negatif olamaz"),
  currency: z.string().length(3).default("TRY"),
});
export type UpsertPriceInput = z.infer<typeof upsertPriceSchema>;

// ── Company discount ──

export const createCompanyDiscountSchema = z
  .object({
    categoryId: z.string().cuid().nullish(),
    productId: z.string().cuid().nullish(),
    discountType: DiscountTypeEnum.default("PERCENTAGE"),
    value: z.number().positive("İskonto değeri sıfırdan büyük olmalı"),
  })
  .superRefine((d, ctx) => {
    if (!d.categoryId && !d.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kategori veya ürün seçilmeli",
      });
    }
    if (d.categoryId && d.productId) {
      // Resolution is product-over-category; a row carrying both is ambiguous.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Aynı satırda hem kategori hem ürün seçilemez",
      });
    }
    if (d.discountType === "PERCENTAGE" && d.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Yüzde iskonto 100'den büyük olamaz",
      });
    }
  });
export type CreateCompanyDiscountInput = z.infer<typeof createCompanyDiscountSchema>;
