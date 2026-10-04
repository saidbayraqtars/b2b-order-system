import { z } from "zod";
import { chequeDetailsSchema } from "./cheque";
import {
  CollectionMethodEnum,
  CollectionOutcomeEnum,
  OrderStatusEnum,
  PaymentMethodEnum,
} from "./enums";
import { entityIdSchema } from "./id";
import { couponCodeSchema } from "./promotion";
import { quantityInput } from "./quantity";

export const cartItemInputSchema = z.object({
  // cuid() değil: içe aktarılan katalogda kimlik Prisma'nın ürettiği biçimde
  // değil ve o kontrol 2.654 ürünü sipariş edilemez yapıyordu — bkz. id.ts.
  variantId: entityIdSchema,
  quantity: quantityInput(),
});
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const createOrderSchema = z.object({
  companyId: z.string().cuid(),
  paymentMethod: PaymentMethodEnum.default("OPEN_ACCOUNT"),
  shippingAddressId: z.string().cuid().optional(),
  note: z.string().max(1000).optional(),
  /** Optional coupon; automatic promotions apply with or without it. */
  couponCode: couponCodeSchema.optional(),
  /** Freight excl. VAT. Ignored unless the caller is on the selling side. */
  shippingFee: z.number().min(0).max(1_000_000).optional(),
  /**
   * Vade picked from the menu this customer was offered (Company.paymentTerms).
   * Anyone may send it — the term is looked up against that menu server-side,
   * so an id the customer was never offered is refused.
   */
  paymentTermId: z.string().cuid().optional(),
  /**
   * Free-form vade in days. Seller side only: a buyer sending this is refused
   * rather than silently ignored, because "365" quietly dropped would look
   * like the term was granted. Reps and admins negotiate, so they may set it.
   */
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  items: z.array(cartItemInputSchema).min(1, "Sepet boş olamaz"),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Sipariş kabul kuralları.
 *
 * `cutoffHour` null gönderilebilir ve bu "söz verme" demek — 0 ile null ayrı
 * şeyler: 0 gece yarısı kesim, null hiç kesim yok.
 */
export const saveOrderPolicySchema = z.object({
  minOrderAmount: z.number().min(0).max(10_000_000),
  minOrderCases: z.number().int().min(0).max(10_000),
  cutoffHour: z.number().int().min(0).max(23).nullable(),
  shipsOnSaturday: z.boolean(),
});
export type SaveOrderPolicyInput = z.infer<typeof saveOrderPolicySchema>;

/** Dönem mutabakat mektuplarını üret. Boş `companyIds` = her aktif firma. */
export const sendReconciliationsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG olmalı"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG olmalı"),
  companyIds: z.array(z.string().cuid()).max(2000).optional(),
  includeZeroBalance: z.boolean().optional(),
});
export type SendReconciliationsInput = z.infer<typeof sendReconciliationsSchema>;

/** Müşterinin cevabı. İtirazda gerekçe zorunlu — kural serviste de var. */
export const respondReconciliationSchema = z.object({
  agreed: z.boolean(),
  note: z.string().trim().max(2000).nullable().optional(),
});

/**
 * Tahsilat araması sonucu.
 *
 * Tarih zorunluluğu **serviste**: şema onu "koşullu zorunlu" yapabilirdi ama o
 * kural iş kuralı ve iki yerde durması, birinin bir gün diğerinden ayrışması
 * demek.
 */
export const recordCollectionCallSchema = z.object({
  companyId: z.string().cuid(),
  outcome: CollectionOutcomeEnum,
  promisedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG olmalı")
    .nullable()
    .optional(),
  promisedAmount: z.number().min(0).max(100_000_000).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const recordPaymentSchema = z.object({
  companyId: z.string().cuid(),
  amount: z.number().positive(),
  /**
   * How the money arrived — nakit, havale, çek… Not PaymentMethod: that enum
   * answers how an *order* gets settled and is read by approval and promotion
   * rules, so cash and cheques have no business in it.
   */
  collectionMethod: CollectionMethodEnum,
  description: z.string().max(500).optional(),
  /**
   * Which kasa/banka hesabı the money went into. Optional on purpose: the
   * mobile app has no such picker and a rep in the field has one drawer, so an
   * omitted account means the default till rather than a rejected collection.
   */
  cashAccountId: z.string().cuid().nullable().optional(),
  /**
   * Çek/senet künyesi. Yalnızca o iki yöntemde okunur, hiçbir alanı zorunlu
   * değildir — sahada tutar giriliyor, gerisi ofiste tamamlanıyor.
   */
  cheque: chequeDetailsSchema.optional(),
  /**
   * Tekrar anahtarı. Ekrandaki onay adımı ve kilitlenen düğme, ağ koptuğunda
   * yeniden gönderen istemciyi durdurmuyordu; sunucuda aynı anahtarla ikinci
   * bir tahsilat yazılmıyor.
   */
  idempotencyKey: z.string().min(8).max(64).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/**
 * Undo a collection recorded by mistake — wrong amount, wrong customer.
 *
 * The ledger is append-only, so this writes an opposing DEBIT rather than
 * deleting anything: both entries stay on the ekstre, which is what the
 * customer's accountant needs to see when reconciling.
 */
export const reversePaymentSchema = z.object({
  /** The company the caller claims the collection belongs to; authorized like
   *  every other company-scoped call, then compared against the stored row. */
  companyId: z.string().cuid(),
  reason: z.string().min(3, "Gerekçe yazın").max(300),
});
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;

export const changeOrderStatusSchema = z.object({
  status: OrderStatusEnum,
  note: z.string().max(500).optional(),
  carrier: z.string().max(120).optional(),
  trackingNumber: z.string().max(120).optional(),
});
export type ChangeOrderStatusInput = z.infer<typeof changeOrderStatusSchema>;

export const checkInSchema = z.object({
  companyId: z.string().cuid(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  note: z.string().max(500).optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;
