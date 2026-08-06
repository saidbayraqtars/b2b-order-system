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
  | "SELF_TARGET"
  // ── account self-service ──
  | "INVALID_PASSWORD"
  // ── promotions ──
  | "PROMOTION_NOT_FOUND"
  | "INVALID_PROMOTION"
  | "DUPLICATE_PROMOTION_CODE"
  | "COUPON_INVALID"
  // ── documents: series, despatch, invoice ──
  | "DOCUMENT_SERIES_MISSING"
  | "EXTERNAL_NUMBER_REQUIRED"
  | "SERIES_NOT_FOUND"
  | "DUPLICATE_SERIES"
  | "INVALID_SERIES_COUNTER"
  | "SHIPMENT_NOT_FOUND"
  | "ORDER_ITEM_NOT_FOUND"
  | "EMPTY_SHIPMENT"
  | "OVER_SHIPMENT"
  | "INVOICE_NOT_FOUND"
  | "NOTHING_TO_INVOICE"
  | "OVER_INVOICE"
  | "ALREADY_INVOICED"
  // ── password reset ──
  | "RESET_TOKEN_INVALID"
  // ── uploads ──
  | "INVALID_UPLOAD"
  // ── storefront ──
  | "ANNOUNCEMENT_NOT_FOUND"
  // ── field operations: collection, visit ──
  | "TRANSACTION_NOT_FOUND"
  | "VISIT_ALREADY_OPEN"
  // ── payment methods and terms ──
  | "PAYMENT_METHOD_NOT_ALLOWED"
  | "PAYMENT_TERM_NOT_ALLOWED"
  | "PAYMENT_TERM_NOT_FOUND"
  | "PAYMENT_TERM_IN_USE"
  | "PAYMENT_TERM_NAME_TAKEN"
  // ── hacim iskontosu ──
  | "VOLUME_TIER_NOT_FOUND"
  | "VOLUME_TIER_IN_USE"
  | "VOLUME_TIER_NAME_TAKEN"
  // ── kasa & banka defteri ──
  | "CASH_ACCOUNT_NOT_FOUND"
  | "CASH_ACCOUNT_NAME_TAKEN"
  | "CASH_ACCOUNT_INACTIVE"
  | "CASH_ACCOUNT_IN_USE"
  | "LAST_CASH_ACCOUNT"
  | "CASH_MOVEMENT_NOT_FOUND"
  | "INVALID_AMOUNT"
  // ── sanal POS / ödeme sağlayıcı ──
  | "PAYMENT_PROVIDER_UNKNOWN"
  | "PAYMENT_INTENT_NOT_FOUND"
  | "PAYMENT_INSTALLMENT_NOT_ALLOWED";

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
