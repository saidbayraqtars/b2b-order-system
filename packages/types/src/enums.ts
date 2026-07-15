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

export const DiscountTypeEnum = z.enum(["PERCENTAGE", "FIXED"]);
export type DiscountType = z.infer<typeof DiscountTypeEnum>;
