import type { Prisma } from "@prisma/client";
import type { DiscountType } from "@repo/types";
import { BusinessError } from "./errors";
import { ZERO, round2 } from "./money";

type Decimal = Prisma.Decimal;

// ── Pure inputs (kept independent of Prisma row shapes so this is unit-testable) ──

export interface PriceRow {
  /** null = default list price (no group). */
  customerGroupId: string | null;
  minQuantity: number;
  price: Decimal;
}

export interface DiscountRow {
  categoryId: string | null;
  productId: string | null;
  discountType: DiscountType;
  value: Decimal;
}

export interface ResolvePriceInput {
  /** All Price rows belonging to the variant. */
  prices: PriceRow[];
  /** The buying company's customer group (null = no group → default prices only). */
  customerGroupId: string | null;
  quantity: number;
  productId: string;
  categoryId: string;
  /** The buying company's discounts (all of them; matching happens here). */
  discounts: DiscountRow[];
}

export interface ResolvedPrice {
  /** Base group/list price before company discount, per unit. */
  unitPrice: Decimal;
  /** Discount applied per unit (>= 0). */
  discountPerUnit: Decimal;
  /** unitPrice - discountPerUnit, floored at 0, per unit. */
  netUnitPrice: Decimal;
  /** netUnitPrice * quantity, excl. VAT. */
  lineNet: Decimal;
}

/**
 * From a set of same-scope price rows, pick the best tier for `quantity`:
 * the row with the highest minQuantity that is still <= quantity.
 * Tie-break: the lowest price. Returns null if none applies.
 */
function pickTier(rows: PriceRow[], quantity: number): Decimal | null {
  let best: PriceRow | null = null;
  for (const row of rows) {
    if (row.minQuantity > quantity) continue;
    if (
      best === null ||
      row.minQuantity > best.minQuantity ||
      (row.minQuantity === best.minQuantity && row.price.lt(best.price))
    ) {
      best = row;
    }
  }
  return best ? best.price : null;
}

/**
 * Resolve the net unit price for a variant given quantity, the company's
 * customer group, and the company's discounts.
 *
 * Precedence:
 *  1. Base price = group-specific tier if present, else default (null-group) tier.
 *  2. Company discount = product-specific if present, else category-specific.
 *
 * Throws BusinessError("NO_PRICE") if neither a group nor a default price exists.
 */
export function resolvePrice(input: ResolvePriceInput): ResolvedPrice {
  const { prices, customerGroupId, quantity, productId, categoryId, discounts } =
    input;

  const groupTier =
    customerGroupId === null
      ? null
      : pickTier(
          prices.filter((p) => p.customerGroupId === customerGroupId),
          quantity,
        );
  const defaultTier = pickTier(
    prices.filter((p) => p.customerGroupId === null),
    quantity,
  );

  const base = groupTier ?? defaultTier;
  if (base === null) {
    throw new BusinessError("NO_PRICE", "Ürün için fiyat tanımlı değil", {
      productId,
    });
  }

  const discountPerUnit = round2(
    computeDiscount(base, productId, categoryId, discounts),
  );
  const unitPrice = round2(base);
  let netUnitPrice = unitPrice.sub(discountPerUnit);
  if (netUnitPrice.lt(ZERO)) netUnitPrice = ZERO;
  netUnitPrice = round2(netUnitPrice);

  return {
    unitPrice,
    discountPerUnit,
    netUnitPrice,
    lineNet: round2(netUnitPrice.mul(quantity)),
  };
}

/** Product-specific discount wins over category-specific. Returns 0 if none. */
function computeDiscount(
  base: Decimal,
  productId: string,
  categoryId: string,
  discounts: DiscountRow[],
): Decimal {
  const match =
    discounts.find((d) => d.productId === productId) ??
    discounts.find((d) => d.categoryId === categoryId);
  if (!match) return ZERO;

  if (match.discountType === "PERCENTAGE") {
    return base.mul(match.value).div(100);
  }
  // FIXED: absolute amount off per unit, never below 0.
  return match.value.gt(base) ? base : match.value;
}
