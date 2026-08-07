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
  /**
   * **TL cinsinden** birim fiyat. Yabancı para birimindeki satırlar buraya
   * gelmeden önce çevriliyor (`convertPriceRows`), böylece iskonto, hacim
   * kademesi ve KDV tek para biriminde hesaplanıyor ve bu dosya döviz diye bir
   * şey bilmiyor.
   */
  price: Decimal;
  /** Listelendiği para birimi; yoksa TL. Yalnızca belgeye basmak için taşınır. */
  currency?: string | null;
  /** O para birimindeki orijinal tutar; yoksa `price`. */
  listPrice?: Decimal;
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
  /**
   * Hacim (turnover) tier rate for this company, or null/0 when none applies.
   * Resolved once per request — see `resolveVolumeDiscount` — because it is a
   * property of the customer, not of the line.
   */
  volumeDiscountPercent?: Decimal | null;
}

export interface ResolvedPrice {
  /** Base group/list price before any discount, per unit. */
  unitPrice: Decimal;
  /**
   * **Total** discount per unit: the company's own plus the hacim tier's.
   * Always `unitPrice - netUnitPrice`, which is what the order snapshot,
   * invoicing and the catalogue all read.
   */
  discountPerUnit: Decimal;
  /** The share of `discountPerUnit` from CompanyDiscount alone. */
  companyDiscountPerUnit: Decimal;
  /** The share of `discountPerUnit` from the hacim tier alone. */
  volumeDiscountPerUnit: Decimal;
  /** unitPrice - discountPerUnit, floored at 0, per unit. */
  netUnitPrice: Decimal;
  /** netUnitPrice * quantity, excl. VAT. */
  lineNet: Decimal;
  /** Seçilen kademenin listelendiği para birimi ("TRY" ise dövizsiz satır). */
  listCurrency: string;
  /** O para birimindeki birim liste fiyatı — belgede "100 USD" diye basılan. */
  listUnitPrice: Decimal;
}

/**
 * From a set of same-scope price rows, pick the best tier for `quantity`:
 * the row with the highest minQuantity that is still <= quantity.
 * Tie-break: the lowest price. Returns null if none applies.
 */
function pickTier(rows: PriceRow[], quantity: number): PriceRow | null {
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
  // Satırın kendisi dönüyor, yalnızca fiyatı değil: hangi kademenin seçildiği
  // belgeye basılacak para birimini de belirliyor.
  return best;
}

/**
 * Resolve the net unit price for a variant given quantity, the company's
 * customer group, its discounts and its hacim tier.
 *
 * Precedence:
 *  1. Base price = group-specific tier if present, else default (null-group) tier.
 *  2. Company discount = product-specific if present, else category-specific.
 *  3. Hacim tier percent, off what is left after step 2.
 *
 * Step 3 compounds rather than adding to step 2 — iskonto üstüne iskonto, the
 * way it is quoted in trade: 20% then 5% is 24% off, not 25%. Adding the rates
 * instead would let a generous private deal plus a top tier reach 100% and give
 * the goods away.
 *
 * Every screen that shows a price goes through here (catalogue, cart, quote,
 * order), so the number a customer sees browsing is the number it is charged.
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

  const chosen = groupTier ?? defaultTier;
  if (chosen === null) {
    throw new BusinessError("NO_PRICE", "Ürün için fiyat tanımlı değil", {
      productId,
    });
  }

  const base = chosen.price;
  const unitPrice = round2(base);
  const companyDiscountPerUnit = round2(
    computeDiscount(base, productId, categoryId, discounts),
  );

  // Floored before the tier is applied: a FIXED discount larger than the price
  // would otherwise make the tier's percentage negative and *add* money back.
  let afterCompany = unitPrice.sub(companyDiscountPerUnit);
  if (afterCompany.lt(ZERO)) afterCompany = ZERO;

  const percent = input.volumeDiscountPercent;
  const volumeDiscountPerUnit =
    percent && percent.gt(ZERO)
      ? round2(afterCompany.mul(percent).div(100))
      : ZERO;

  const discountPerUnit = companyDiscountPerUnit.add(volumeDiscountPerUnit);
  let netUnitPrice = afterCompany.sub(volumeDiscountPerUnit);
  if (netUnitPrice.lt(ZERO)) netUnitPrice = ZERO;
  netUnitPrice = round2(netUnitPrice);

  return {
    unitPrice,
    discountPerUnit,
    companyDiscountPerUnit,
    volumeDiscountPerUnit,
    netUnitPrice,
    lineNet: round2(netUnitPrice.mul(quantity)),
    listCurrency: chosen.currency ?? "TRY",
    listUnitPrice: chosen.listPrice ?? unitPrice,
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
