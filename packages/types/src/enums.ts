import { z } from "zod";

// Single edge-safe source of truth for role/status literals.
// Names MUST match the Prisma enums in packages/database/prisma/schema.prisma.

export const RoleEnum = z.enum([
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
]);
export type Role = z.infer<typeof RoleEnum>;

export const OrderStatusEnum = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "PENDING_CREDIT",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REJECTED",
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

/**
 * How an order is agreed to be settled.
 *
 * Which of these create a cari receivable is decided in one place —
 * `paymentMethodMeta()` in @repo/services. Nothing else may branch on a
 * specific member, or adding the next method means hunting for `=== "..."`.
 */
export const PaymentMethodEnum = z.enum([
  "OPEN_ACCOUNT",
  "CREDIT_CARD",
  "BANK_TRANSFER",
  "CASH",
  "CHEQUE",
]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  OPEN_ACCOUNT: "Açık hesap (cari)",
  CREDIT_CARD: "Kredi kartı",
  BANK_TRANSFER: "Havale / EFT",
  CASH: "Nakit",
  CHEQUE: "Çek",
};

export const TransactionTypeEnum = z.enum(["DEBIT", "CREDIT"]);
export type TransactionType = z.infer<typeof TransactionTypeEnum>;

/**
 * How a collection reached us. Still separate from PaymentMethod even though
 * several member names now coincide: this records money that has already moved,
 * the other records what an order *agreed* to and is read by the credit check,
 * approval and promotion rules. One enum for both would drag every new
 * collection channel into the order engine.
 */
export const CollectionMethodEnum = z.enum([
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "PROMISSORY_NOTE",
  "CREDIT_CARD",
  "OTHER",
]);
export type CollectionMethod = z.infer<typeof CollectionMethodEnum>;

export const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = {
  CASH: "Nakit",
  BANK_TRANSFER: "Havale / EFT",
  CHEQUE: "Çek",
  PROMISSORY_NOTE: "Senet",
  CREDIT_CARD: "Kredi kartı",
  OTHER: "Diğer",
};

/** Which application wrote a field record (visit, collection). */
export const FieldEntrySourceEnum = z.enum(["MOBILE", "WEB"]);
export type FieldEntrySource = z.infer<typeof FieldEntrySourceEnum>;

export const DiscountTypeEnum = z.enum(["PERCENTAGE", "FIXED"]);
export type DiscountType = z.infer<typeof DiscountTypeEnum>;

/**
 * Whether a customer's hacim (turnover) tier is earned from its own orders or
 * granted by an admin. Under MANUAL the pinned tier is the whole answer and
 * turnover is never consulted — including "pinned to nothing", which is how the
 * ladder is switched off for a single cari.
 */
export const VolumeDiscountModeEnum = z.enum(["AUTO", "MANUAL"]);
export type VolumeDiscountMode = z.infer<typeof VolumeDiscountModeEnum>;

export const VOLUME_DISCOUNT_MODE_LABELS: Record<VolumeDiscountMode, string> = {
  AUTO: "Otomatik (ciroya göre)",
  MANUAL: "Elle atanmış",
};
