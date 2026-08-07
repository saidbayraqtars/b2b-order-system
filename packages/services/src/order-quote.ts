import { Prisma, prisma } from "@repo/database";
import type { PaymentMethod } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, ZERO, round2 } from "./money";
import type { Money } from "./money";
import { createsReceivable, resolvePaymentTerm } from "./payment-terms";
import { convertPriceRows, currentRatesTx, rateFor } from "./exchange-rate";
import { resolvePrice } from "./pricing";
import { applyPromotions, type AppliedPromotion } from "./promotion-engine";
import type { EngineLine } from "./promotion-registry";
import {
  assertCouponApplied,
  buildEngineContext,
  loadEligiblePromotions,
  normalizeCoupon,
} from "./promotion";
import { resolveVolumeDiscount, type ResolvedVolumeDiscount } from "./volume-discount";

// Pricing a cart is one calculation, used twice: the buyer previews it from the
// portal, then places the order and the same numbers get frozen into the
// snapshot. Keeping it in one function is what stops the two from drifting —
// a promotion the cart promised is the promotion the order charges.

type Client = Prisma.TransactionClient;

export interface QuoteInput {
  companyId: string;
  paymentMethod: PaymentMethod;
  /** Vade chosen from the customer's own menu. */
  paymentTermId?: string | null;
  /** Free-form vade in days; honoured only when `isSeller`. */
  paymentTermDays?: number | null;
  /** SUPER_ADMIN / SALES_REP — may price freight and set a vade directly. */
  isSeller?: boolean;
  couponCode?: string;
  /** Freight, excl. VAT. Seller-side only — a buyer cannot price its own delivery. */
  shippingFee?: number | string;
  shippingVatRate?: number;
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
  /** Company discount plus hacim tier, per unit. */
  discountPerUnit: Money;
  /** The hacim tier's share of `discountPerUnit`, per unit. */
  volumeDiscountPerUnit: Money;
  /** unitPrice × quantity. */
  lineGross: Money;
  /** discountPerUnit × quantity. */
  lineDiscount: Money;
  /** Promotion discount allocated to this line (whole line, not per unit). */
  promotionDiscount: Money;
  /** What the line costs after both discounts, excl. VAT. */
  lineNet: Money;
  lineTax: Money;
  /** True for a line a campaign added free of charge. */
  isGift: boolean;
  /** Fiyatın listelendiği para birimi ("TRY" ise dövizsiz). */
  listCurrency: string;
  /** O para birimindeki birim liste fiyatı. */
  listUnitPrice: Money;
  /** Çevrimde kullanılan kur — siparişe donuyor. */
  exchangeRate: Money;
}

export interface QuoteCompany {
  id: string;
  creditLimit: Money;
  currentBalance: Money;
  requiresOrderApproval: boolean;
  customerGroupId: string | null;
  paymentTermDays: number;
}

/** The settlement the quote was priced under, already validated for this customer. */
export interface QuoteTerms {
  method: PaymentMethod;
  /** Vade agreed for this order; null = the company's default. */
  paymentTermDays: number | null;
  /** What the vade works out to, default included — for display and due dates. */
  effectiveTermDays: number;
  /** True when the order will book a cari DEBIT rather than being paid at once. */
  createsReceivable: boolean;
}

export interface OrderQuote {
  lines: QuotedLine[];
  subtotal: Money;
  discountTotal: Money;
  /** Campaign discount on the goods — equal to the sum of the lines'. */
  promotionTotal: Money;
  /** Freight after any campaign discount on it, excl. VAT. */
  shippingFee: Money;
  /**
   * What a campaign took off the freight. Already gone from `shippingFee`, so
   * it takes no part in the grand total — subtracting it again would discount
   * the delivery twice.
   */
  shippingDiscount: Money;
  shippingVatRate: number;
  /** Goods VAT plus freight VAT. */
  taxTotal: Money;
  grandTotal: Money;
  appliedPromotions: AppliedPromotion[];
  coupon: string | null;
  company: QuoteCompany;
  terms: QuoteTerms;
  /**
   * The hacim rung this cart was priced under, and what it took off in total.
   * Already inside `discountTotal` — carried separately only so the cart can
   * name it, the way a campaign line names itself.
   */
  volumeDiscount: (ResolvedVolumeDiscount & { amount: Money }) | null;
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
      paymentTermDays: true,
      allowedPaymentMethods: true,
      volumeDiscountMode: true,
      volumeTierId: true,
      paymentTerms: {
        where: { isActive: true },
        select: { id: true, name: true, days: true },
      },
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

  // Settlement is settled first: an order the customer may not pay for that way
  // should not be priced at all, and the promotion engine is about to read the
  // method as a condition. Both the cart preview and order creation come
  // through here, so the check cannot be skipped by posting straight to /orders.
  const resolvedTerm = resolvePaymentTerm(company, {
    method: input.paymentMethod,
    paymentTermId: input.paymentTermId ?? null,
    paymentTermDaysOverride: input.paymentTermDays ?? null,
    isSeller: input.isSeller ?? false,
  });

  // Resolved once for the whole cart: the rung belongs to the customer, not to
  // a line, and it is also what the order snapshots.
  const volumeDiscount = await resolveVolumeDiscount(client, company);
  const volumePercent = volumeDiscount?.percent ?? null;

  // Kur bir kez okunuyor: aynı sepetteki iki satırın farklı kurdan
  // fiyatlanması, toplamın hangi ana ait olduğunu belirsiz bırakırdı.
  const rates = await currentRatesTx(client, undefined);

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
        select: {
          customerGroupId: true,
          minQuantity: true,
          price: true,
          currency: true,
        },
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
      prices: convertPriceRows(v.prices, rates),
      customerGroupId: company.customerGroupId,
      quantity: item.quantity,
      productId: v.product.id,
      categoryId: v.product.categoryId,
      discounts: company.discounts,
      volumeDiscountPercent: volumePercent,
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
      volumeDiscountPerUnit: r.volumeDiscountPerUnit,
      listCurrency: r.listCurrency,
      listUnitPrice: r.listUnitPrice,
      exchangeRate: rateFor(r.listCurrency, rates),
      lineGross: round2(r.unitPrice.mul(item.quantity)),
      lineDiscount: round2(r.discountPerUnit.mul(item.quantity)),
      promotionDiscount: ZERO,
      lineNet: r.lineNet,
      lineTax: ZERO,
      isGift: false,
    });
  }

  // 2. Campaigns, on top of the company's own prices.
  const coupon = normalizeCoupon(input.couponCode);
  const { promotions, couponFound } = await loadEligiblePromotions(client, {
    companyId: company.id,
    couponCode: coupon,
  });

  const shippingVatRate = input.shippingVatRate ?? 20;
  let shippingFee = round2(new Dec(input.shippingFee ?? 0));
  let shippingDiscount = ZERO;

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

    const result = applyPromotions({
      lines: engineLines,
      context,
      promotions,
      shippingFee,
    });
    for (const line of lines) {
      const granted = result.perLine.get(line.variantId);
      if (!granted) continue;
      line.promotionDiscount = granted;
      line.lineNet = round2(line.lineNet.sub(granted));
    }
    shippingDiscount = result.shippingDiscount;
    shippingFee = round2(shippingFee.sub(shippingDiscount));
    promotionTotal = result.total;
    appliedPromotions = result.applied;

    // Gifts are priced here, not in the engine: the engine knows nothing about
    // the catalogue. Each gift becomes a line carrying its own list value and
    // an equal promotion discount, so it nets to zero on the order and still
    // shows what it was worth on the invoice.
    if (result.gifts.length > 0) {
      const giftLines = await priceGifts(client, {
        gifts: result.gifts,
        customerGroupId: company.customerGroupId,
        discounts: company.discounts,
        volumeDiscountPercent: volumePercent,
        // A gift of something already in the cart must not eat the stock the
        // paid line is holding.
        reserved: lines.reduce<Map<string, number>>((map, l) => {
          map.set(l.variantId, (map.get(l.variantId) ?? 0) + l.quantity);
          return map;
        }, new Map()),
      });

      for (const gift of giftLines) {
        lines.push(gift.line);
        promotionTotal = promotionTotal.add(gift.value);

        const promo = appliedPromotions.find(
          (a) => a.promotionId === gift.promotionId,
        );
        if (promo) promo.amount = round2(promo.amount.add(gift.value));
      }
      promotionTotal = round2(promotionTotal);
    }
  }

  assertCouponApplied(coupon, couponFound, appliedPromotions);

  // 3. VAT is charged on what is actually paid — i.e. after the promotion.
  let subtotal = ZERO;
  let discountTotal = ZERO;
  let volumeTotal = ZERO;
  let taxTotal = ZERO;
  for (const line of lines) {
    line.lineTax = round2(line.lineNet.mul(line.vatRate).div(100));
    subtotal = subtotal.add(line.lineGross);
    discountTotal = discountTotal.add(line.lineDiscount);
    volumeTotal = volumeTotal.add(line.volumeDiscountPerUnit.mul(line.quantity));
    taxTotal = taxTotal.add(line.lineTax);
  }

  // 4. Freight is its own taxed line, outside the goods subtotal. Whatever a
  //    shipping campaign took off is already gone from it, so the VAT follows
  //    the amount actually charged.
  if (shippingFee.gt(ZERO)) {
    taxTotal = taxTotal.add(round2(shippingFee.mul(shippingVatRate).div(100)));
  }

  subtotal = round2(subtotal);
  discountTotal = round2(discountTotal);
  taxTotal = round2(taxTotal);
  const grandTotal = round2(
    subtotal
      .sub(discountTotal)
      .sub(promotionTotal)
      .add(shippingFee)
      .add(taxTotal),
  );

  return {
    lines,
    subtotal,
    discountTotal,
    promotionTotal,
    shippingFee,
    shippingDiscount,
    shippingVatRate,
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
      paymentTermDays: company.paymentTermDays,
    },
    terms: {
      method: resolvedTerm.method,
      paymentTermDays: resolvedTerm.paymentTermDays,
      effectiveTermDays: resolvedTerm.paymentTermDays ?? company.paymentTermDays,
      createsReceivable: createsReceivable(resolvedTerm.method),
    },
    volumeDiscount: volumeDiscount
      ? { ...volumeDiscount, amount: round2(volumeTotal) }
      : null,
  };
}

interface PricedGift {
  promotionId: string;
  /** List value of the gift, which is also the discount that cancels it. */
  value: Money;
  line: QuotedLine;
}

/**
 * Turn engine gift grants into order lines.
 *
 * A gift is skipped rather than failing the order when the item cannot be
 * given: no stock left after the paid lines have taken theirs, or no price the
 * company could be charged (a gift with no value could not be invoiced). A
 * campaign misconfigured months ago must not be able to block checkout today.
 */
async function priceGifts(
  client: Client,
  params: {
    gifts: Array<{ promotionId: string; variantId: string; quantity: number }>;
    customerGroupId: string | null;
    discounts: Array<{
      categoryId: string | null;
      productId: string | null;
      discountType: "PERCENTAGE" | "FIXED";
      value: Prisma.Decimal;
    }>;
    /** Same rung as the paid lines — a gift is valued at what the customer pays. */
    volumeDiscountPercent: Prisma.Decimal | null;
    reserved: Map<string, number>;
  },
): Promise<PricedGift[]> {
  // Several campaigns may grant the same item; ask for each variant once.
  const wanted = new Map<string, number>();
  for (const gift of params.gifts) {
    wanted.set(gift.variantId, (wanted.get(gift.variantId) ?? 0) + gift.quantity);
  }

  const variants = await client.productVariant.findMany({
    where: { id: { in: [...wanted.keys()] }, product: { isActive: true } },
    select: {
      id: true,
      sku: true,
      stock: true,
      product: { select: { id: true, name: true, vatRate: true, categoryId: true } },
      prices: {
        select: {
          customerGroupId: true,
          minQuantity: true,
          price: true,
          currency: true,
        },
      },
    },
  });
  const vmap = new Map(variants.map((v) => [v.id, v]));
  const giftRates = await currentRatesTx(client, undefined);

  const out: PricedGift[] = [];
  const taken = new Map(params.reserved);

  for (const gift of params.gifts) {
    const v = vmap.get(gift.variantId);
    if (!v) continue; // withdrawn from the catalogue since the campaign was written

    const already = taken.get(v.id) ?? 0;
    const available = v.stock - already;
    const quantity = Math.min(gift.quantity, Math.max(0, available));
    if (quantity === 0) continue;

    let priced;
    try {
      priced = resolvePrice({
        prices: convertPriceRows(v.prices, giftRates),
        customerGroupId: params.customerGroupId,
        quantity,
        productId: v.product.id,
        categoryId: v.product.categoryId,
        discounts: params.discounts,
        volumeDiscountPercent: params.volumeDiscountPercent,
      });
    } catch {
      continue; // no price for this company — nothing to put on the invoice
    }

    const value = round2(priced.netUnitPrice.mul(quantity));
    if (value.lte(ZERO)) continue;

    taken.set(v.id, already + quantity);
    out.push({
      promotionId: gift.promotionId,
      value,
      line: {
        variantId: v.id,
        productId: v.product.id,
        categoryId: v.product.categoryId,
        productName: v.product.name,
        sku: v.sku,
        quantity,
        caseCount: null,
        vatRate: v.product.vatRate,
        unitPrice: priced.unitPrice,
        discountPerUnit: priced.discountPerUnit,
        volumeDiscountPerUnit: priced.volumeDiscountPerUnit,
        listCurrency: priced.listCurrency,
        listUnitPrice: priced.listUnitPrice,
        exchangeRate: rateFor(priced.listCurrency, giftRates),
        lineGross: round2(priced.unitPrice.mul(quantity)),
        lineDiscount: round2(priced.discountPerUnit.mul(quantity)),
        promotionDiscount: value,
        lineNet: ZERO,
        lineTax: ZERO,
        isGift: true,
      },
    });
  }

  return out;
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
  isGift: boolean;
  /** Fiyatın listelendiği para birimi; "TRY" ise sepet hiçbir şey göstermez. */
  listCurrency: string;
  /** O para birimindeki birim liste fiyatı ve kullanılan kur. */
  listUnitPrice: string;
  exchangeRate: string;
}

export interface OrderQuoteView {
  lines: QuoteLineView[];
  subtotal: string;
  discountTotal: string;
  promotionTotal: string;
  shippingFee: string;
  shippingDiscount: string;
  taxTotal: string;
  grandTotal: string;
  promotions: Array<{
    promotionId: string;
    name: string;
    code: string | null;
    amount: string;
  }>;
  coupon: string | null;
  /**
   * The settlement this price is good for. The panel shows what the server
   * accepted rather than what the user clicked, so a rejected method or vade
   * can never sit unnoticed in the UI next to a valid total.
   */
  paymentMethod: PaymentMethod;
  /** Vade in days including the company default — 0 means peşin. */
  paymentTermDays: number;
  /** Whether this order will be booked as cari debt. */
  createsReceivable: boolean;
  /**
   * The hacim rung this price includes, named so the cart can show it as its
   * own line. Its `amount` is already part of `discountTotal` — the panel must
   * not subtract it again.
   */
  volumeDiscount: { tierName: string; percent: string; amount: string } | null;
}

/** Price a cart for the portal without touching stock, orders or the ledger. */
export async function quoteOrder(input: QuoteInput): Promise<OrderQuoteView> {
  const quote = await buildQuote(prisma, input);

  return {
    lines: quote.lines.map((l) => ({
      listCurrency: l.listCurrency,
      listUnitPrice: l.listUnitPrice.toFixed(2),
      exchangeRate: l.exchangeRate.toFixed(4),
      variantId: l.variantId,
      sku: l.sku,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toFixed(2),
      discountPerUnit: l.discountPerUnit.toFixed(2),
      promotionDiscount: l.promotionDiscount.toFixed(2),
      lineNet: l.lineNet.toFixed(2),
      vatRate: l.vatRate,
      isGift: l.isGift,
    })),
    subtotal: quote.subtotal.toFixed(2),
    discountTotal: quote.discountTotal.toFixed(2),
    promotionTotal: quote.promotionTotal.toFixed(2),
    shippingFee: quote.shippingFee.toFixed(2),
    shippingDiscount: quote.shippingDiscount.toFixed(2),
    taxTotal: quote.taxTotal.toFixed(2),
    grandTotal: quote.grandTotal.toFixed(2),
    promotions: quote.appliedPromotions.map((p) => ({
      promotionId: p.promotionId,
      name: p.name,
      code: p.code,
      amount: p.amount.toFixed(2),
    })),
    coupon: quote.coupon,
    paymentMethod: quote.terms.method,
    paymentTermDays: quote.terms.effectiveTermDays,
    createsReceivable: quote.terms.createsReceivable,
    volumeDiscount: quote.volumeDiscount
      ? {
          tierName: quote.volumeDiscount.tierName,
          percent: quote.volumeDiscount.percent.toFixed(2),
          amount: quote.volumeDiscount.amount.toFixed(2),
        }
      : null,
  };
}
