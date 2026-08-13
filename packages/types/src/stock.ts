import { z } from "zod";
import { StockDirectionEnum, StockMovementSourceEnum } from "./enums";

// Stok hareket defteri: elle giriş/çıkış, sayım, depolar arası aktarım, ters
// kayıt ve defteri okuma süzgeci. Kimin çağırabileceği rota katmanında;
// buradakiler yalnızca biçim.

/** Adet her yerde tam sayı: yarım koli diye bir şey yok, birim ürün kartında. */
const quantity = z.coerce
  .number()
  .int("Adet tam sayı olmalı")
  .min(1, "Adet sıfırdan büyük olmalı")
  .max(9_999_999);

/** Sayımda sıfır geçerli bir cevap — "hiç kalmamış" da bir sayım sonucudur. */
const countedQuantity = z.coerce
  .number()
  .int("Adet tam sayı olmalı")
  .min(0)
  .max(9_999_999);

/** ISO tarih (YYYY-MM-DD) ya da tam zaman damgası; servis güne normalize eder. */
const dateString = z.string().trim().min(8).max(40);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

export const warehouseSchema = z.object({
  code: z.string().trim().min(1, "Depo kodu gerekli").max(40),
  name: z.string().trim().min(1, "Depo adı gerekli").max(120),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const manualStockMovementSchema = z.object({
  variantId: z.string().cuid(),
  warehouseId: z.string().cuid().optional(),
  direction: StockDirectionEnum,
  quantity,
  /**
   * Zorunlu: açıklaması olmayan bir stok hareketi ile kayıp mal arasında fark
   * yoktur. Kasadaki elle girişle aynı gerekçe.
   */
  description: z.string().trim().min(1, "Açıklama gerekli").max(300),
  occurredAt: dateString.optional(),
});
export type ManualStockMovementInput = z.infer<typeof manualStockMovementSchema>;

/**
 * Sayım: kullanıcı *sayılan adedi* yazar, farkı sistem hesaplar.
 *
 * Fark yazdırmak yerine sayılanı istemenin sebebi, sayım kâğıdında yazan sayının
 * bu olması. Farkı insana hesaplatmak, defterin sayısını görünce sayımı ona
 * uydurma eğilimini de doğuruyor.
 */
export const stockCountSchema = z.object({
  variantId: z.string().cuid(),
  warehouseId: z.string().cuid().optional(),
  counted: countedQuantity,
  description: optionalText(300),
  occurredAt: dateString.optional(),
});
export type StockCountInput = z.infer<typeof stockCountSchema>;

export const stockTransferSchema = z
  .object({
    variantId: z.string().cuid(),
    fromWarehouseId: z.string().cuid(),
    toWarehouseId: z.string().cuid(),
    quantity,
    description: optionalText(300),
    occurredAt: dateString.optional(),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, "Aynı depoya aktarım yapılamaz");
export type StockTransferInput = z.infer<typeof stockTransferSchema>;

export const reverseStockMovementSchema = z.object({
  reason: z.string().trim().min(1, "İptal gerekçesi gerekli").max(300),
});
export type ReverseStockMovementInput = z.infer<typeof reverseStockMovementSchema>;

export const stockLevelFilterSchema = z.object({
  q: optionalText(120),
  warehouseId: z.string().cuid().optional(),
  /**
   * Sorgu dizesinden gelen değer her zaman metin; `z.coerce.boolean()` burada
   * "false"u da true yapardı.
   */
  lowOnly: z
    .union([z.literal("1"), z.literal("true"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "1" || v === "true"),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type StockLevelFilter = z.infer<typeof stockLevelFilterSchema>;

export const stockMovementFilterSchema = z.object({
  variantId: z.string().cuid().optional(),
  warehouseId: z.string().cuid().optional(),
  source: StockMovementSourceEnum.optional(),
  direction: StockDirectionEnum.optional(),
  /** SKU / barkod / ürün adı — defteri ürün aramadan süzebilmek için. */
  q: optionalText(120),
  from: dateString.optional(),
  to: dateString.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type StockMovementFilter = z.infer<typeof stockMovementFilterSchema>;
