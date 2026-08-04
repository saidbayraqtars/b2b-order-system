import { Prisma, prisma } from "@repo/database";
import type { PaymentMethod } from "@repo/types";
import { BusinessError } from "./errors";
import { ZERO, round2 } from "./money";
import type { Money } from "./money";
import { resolvePrice } from "./pricing";
import { applyPromotions, type AppliedPromotion } from "./promotion-engine";
import type { EngineLine } from "./promotion-registry";
import {
  assertCouponApplied,
  buildEngineContext,
  loadEligiblePromotions,
  normalizeCoupon,
} from "./promotion";

// Pricing a cart is one calculation, used twice: the buyer previews it from the
// portal, then places the order and the same numbers get frozen into the
// snapshot. Keeping it in one function is what stops the two from drifting —
// a promotion the cart promised is the promotion the order charges.

type Client = Prisma.TransactionClient;

export interface QuoteInput {
  companyId: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  items: Array<{ variantId: string; quantity: number }>;
}

/** One priced cart line, still in Decimal — the API layer stringifies it. */
export interface QuotedLine {
  variantId: string;
  productId: string;
  categoryId: string;
  productName: string;
  sku: string;
  quantity: number;
  caseCount: number | null;
  vatRate: number;
  /** List/group price per unit, before any discount. */
  unitPrice: Money;
  /** Company discount per unit. */
  discountPerUnit: Money;
  /** unitPrice × quantity. */
  lineGross: Money;
  /** discountPerUnit × quantity. */
  lineDiscount: Money;
  /** Promotion discount allocated to this line (whole line, not per unit). */
  promotionDiscount: Money;
  /** What the line costs after both discounts, excl. VAT. */
  lineNet: Money;
  lineTax: Money;
}

export interface QuoteCompany {
  id: string;
  creditLimit: Money;
  currentBalance: Money;
  requiresOrderApproval: boolean;
  customerGroupId: string | null;
}

export interface OrderQuote {
  lines: QuotedLine[];
  subtotal: Money;
  discountTotal: Money;
  promotionTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
  appliedPromotions: AppliedPromotion[];
  coupon: string | null;
  company: QuoteCompany;
}

/**
 * Validate the cart, resolve prices, run the promotion engine and total it up.
 *
 * Throws the same domain errors as order creation (MOQ, case multiple, stock,
 * missing price, invalid coupon) — so a cart that quotes cleanly is a cart that
 * can be ordered, and a preview never hides a failure until checkout.
 */
export async function buildQuote(
  client: Client,
  input: QuoteInput,
): Promise<OrderQuote> {
  if (input.items.length === 0) {
    throw new BusinessError("EMPTY_ORDER", "Sepet boş olamaz");
  }

  const company = await client.company.findUnique({
    where: { id: input.companyId },
    select: {
      id: true,
      creditLimit: true,
      currentBalance: true,
      requiresOrderApproval: true,
      customerGroupId: true,
      discounts: {
        select: {
          categoryId: true,
          productId: true,
          discountType: true,
          value: true,
        },
      },
    },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı", {
      companyId: input.companyId,
    });
  }

  const variants = await client.productVariant.findMany({
    where: { id: { in: input.items.map((i) => i.variantId) } },
    select: {
      id: true,
      sku: true,
      stock: true,
      unitsPerCase: true,
      moqUnits: true,
      product: {
        select: { id: true, name: true, vatRate: true, categoryId: true },
      },
      prices: {
        select: { customerGroupId: true, minQuantity: true, price: true },
      },
    },
  });
  const vmap = new Map(variants.map((v) => [v.id, v]));

  // 1. Price every line and check what the catalogue demands of it.
  const lines: QuotedLine[] = [];
  for (const item of input.items) {
    const v = vmap.get(item.variantId);
    if (!v) {
      throw new BusinessError("VARIANT_NOT_FOUND", "Ürün bulunamadı", {
        variantId: item.variantId,
      });
    }
    if (item.quantity < v.moqUnits) {
      throw new BusinessError(
        "MOQ_NOT_MET",
        `${v.sku}: minimum sipariş ${v.moqUnits} adet`,
        { sku: v.sku, moqUnits: v.moqUnits },
      );
    }
    if (v.unitsPerCase > 1 && item.quantity % v.unitsPerCase !== 0) {
      throw new BusinessError(
        "NOT_CASE_MULTIPLE",
        `${v.sku}: koli katı olmalı (${v.unitsPerCase} adet/koli)`,
        { sku: v.sku, unitsPerCase: v.unitsPerCase },
      );
    }
    if (item.quantity > v.stock) {
      throw new BusinessError(
        "INSUFFICIENT_STOCK",
        `${v.sku}: yetersiz stok (${v.stock} adet)`,
        { sku: v.sku, stock: v.stock },
      );
    }

    const r = resolvePrice({
      prices: v.prices,
      customerGroupId: company.customerGroupId,
      quantity: item.quantity,
      productId: v.product.id,
      categoryId: v.product.categoryId,
      discounts: company.discounts,
    });

    lines.push({
      variantId: v.id,
      productId: v.product.id,
      categoryId: v.product.categoryId,
      productName: v.product.name,
      sku: v.sku,
      quantity: item.quantity,
      caseCount: v.unitsPerCase > 1 ? item.quantity / v.unitsPerCase : null,
      vatRate: v.product.vatRate,
      unitPrice: r.unitPrice,
      discountPerUnit: r.discountPerUnit,
      lineGross: round2(r.unitPrice.mul(item.quantity)),
      lineDiscount: round2(r.discountPerUnit.mul(item.quantity)),
      promotionDiscount: ZERO,
      lineNet: r.lineNet,
      lineTax: ZERO,
    });
  }

  // 2. Campaigns, on top of the company's own prices.
  const coupon = normalizeCoupon(input.couponCode);
  const { promotions, couponFound } = await loadEligiblePromotions(client, {
    companyId: company.id,
    couponCode: coupon,
  });

  let promotionTotal = ZERO;
  let appliedPromotions: AppliedPromotion[] = [];

  if (promotions.length > 0) {
    const context = await buildEngineContext(client, {
      companyId: company.id,
      customerGroupId: company.customerGroupId,
      paymentMethod: input.paymentMethod,
    });
    const engineLines: EngineLine[] = lines.map((l) => ({
      key: l.variantId,
      productId: l.productId,
      categoryId: l.categoryId,
      quantity: l.quantity,
      net: l.lineNet,
    }));

    const result = applyPromotions({ lines: engineLines, context, promotions });
    for (const line of lines) {
      const granted = result.perLine.get(line.variantId);
      if (!granted) continue;
      line.promotionDiscount = granted;
      line.lineNet = round2(line.lineNet.sub(granted));
    }
    promotionTotal = result.total;
    appliedPromotions = result.applied;
  }

  assertCouponApplied(coupon, couponFound, appliedPromotions);

  // 3. VAT is charged on what is actually paid — i.e. after the promotion.
  let subtotal = ZERO;
  let discountTotal = ZERO;
  let taxTotal = ZERO;
  for (const line of lines) {
    line.lineTax = round2(line.lineNet.mul(line.vatRate).div(100));
    subtotal = subtotal.add(line.lineGross);
    discountTotal = discountTotal.add(line.lineDiscount);
    taxTotal = taxTotal.add(line.lineTax);
  }

  subtotal = round2(subtotal);
  discountTotal = round2(discountTotal);
  taxTotal = round2(taxTotal);
  const grandTotal = round2(
    subtotal.sub(discountTotal).sub(promotionTotal).add(taxTotal),
  );

  return {
    lines,
    subtotal,
    discountTotal,
    promotionTotal,
    taxTotal,
    grandTotal,
    appliedPromotions,
    coupon,
    company: {
      id: company.id,
      creditLimit: company.creditLimit,
      currentBalance: company.currentBalance,
      requiresOrderApproval: company.requiresOrderApproval,
      customerGroupId: company.customerGroupId,
    },
  };
}

// ── API-facing shape (money as strings, like every other endpoint) ──

export interface QuoteLineView {
  variantId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  discountPerUnit: string;
  promotionDiscount: string;
  lineNet: string;
  vatRate: number;
}

export interface OrderQuoteView {
  lines: QuoteLineView[];
  subtotal: string;
  discountTotal: string;
  promotionTotal: string;
  taxTotal: string;
  grandTotal: string;
  promotions: Array<{
    promotionId: string;
    name: string;
    code: string | null;
    amount: string;
  }>;
  coupon: string | null;
}

/** Price a cart for the portal without touching stock, orders or the ledger. */
export async function quoteOrder(input: QuoteInput): Promise<OrderQuoteView> {
  const quote = await buildQuote(prisma, input);

  return {
    lines: quote.lines.map((l) => ({
      variantId: l.variantId,
      sku: l.sku,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toFixed(2),
      discountPerUnit: l.discountPerUnit.toFixed(2),
      promotionDiscount: l.promotionDiscount.toFixed(2),
      lineNet: l.lineNet.toFixed(2),
      vatRate: l.vatRate,
    })),
    subtotal: quote.subtotal.toFixed(2),
    discountTotal: quote.discountTotal.toFixed(2),
    promotionTotal: quote.promotionTotal.toFixed(2),
    taxTotal: quote.taxTotal.toFixed(2),
    grandTotal: quote.grandTotal.toFixed(2),
    promotions: quote.appliedPromotions.map((p) => ({
      promotionId: p.promotionId,
      name: p.name,
      code: p.code,
      amount: p.amount.toFixed(2),
    })),
    coupon: quote.coupon,
  };
}
