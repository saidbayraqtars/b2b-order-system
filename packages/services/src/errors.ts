/**
 * Domain-level business error. Route handlers map these to JSON responses
 * (see apps/web/src/lib/guard.ts withBusinessErrors).
 */
export type BusinessErrorCode =
  | "NO_PRICE"
  | "VARIANT_NOT_FOUND"
  | "COMPANY_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "MOQ_NOT_MET"
  | "NOT_CASE_MULTIPLE"
  | "INSUFFICIENT_STOCK"
  | "EMPTY_ORDER"
  | "FORBIDDEN_APPROVAL"
  | "INVALID_STATE"
  | "CHECKIN_NOT_FOUND"
  | "FORBIDDEN"
  // ── catalog administration ──
  | "PRODUCT_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "PRICE_NOT_FOUND"
  | "DISCOUNT_NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "DUPLICATE_SKU"
  | "DUPLICATE_BARCODE"
  | "DUPLICATE_PRICE_TIER"
  | "CATEGORY_HAS_CHILDREN"
  | "CATEGORY_IN_USE"
  | "IN_USE"
  | "INVALID_DISCOUNT_TARGET"
  | "CATEGORY_CYCLE"
  // ── user-defined reports ──
  | "REPORT_NOT_FOUND"
  | "INVALID_REPORT"
  // ── company / user administration ──
  | "USER_NOT_FOUND"
  | "ADDRESS_NOT_FOUND"
  | "DUPLICATE_EMAIL"
  | "DUPLICATE_TAX_NUMBER"
  | "DUPLICATE_GROUP"
  | "INVALID_ROLE"
  | "LAST_SUPER_ADMIN"
  | "SELF_TARGET";

export class BusinessError extends Error {
  constructor(
    public readonly code: BusinessErrorCode,
    message: string,
    /** Optional structured context (e.g. which SKU failed). */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}
