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

export const PaymentMethodEnum = z.enum(["OPEN_ACCOUNT", "CREDIT_CARD"]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const TransactionTypeEnum = z.enum(["DEBIT", "CREDIT"]);
export type TransactionType = z.infer<typeof TransactionTypeEnum>;

/**
 * How a collection reached us. Separate from PaymentMethod on purpose: that one
 * describes how an *order* will be settled and is read by order approval and
 * promotion conditions, where "nakit" and "çek" mean nothing.
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
