/**
 * Domain-level business error. Route handlers map these to JSON responses
 * (see apps/web/src/lib/guard.ts withBusinessErrors).
 */
export type BusinessErrorCode =
  | "NO_PRICE"
  | "VARIANT_NOT_FOUND"
  | "COMPANY_NOT_FOUND"
  | "MOQ_NOT_MET"
  | "NOT_CASE_MULTIPLE"
  | "INSUFFICIENT_STOCK"
  | "EMPTY_ORDER"
  | "INVALID_STATE";

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
