import { Prisma, prisma } from "@repo/database";
import type { CreateOrderInput, OrderStatus, Role } from "@repo/types";
import { postOrderCashIn } from "./cash";
import { BusinessError } from "./errors";
import { Dec } from "./money";
import { buildQuote } from "./order-quote";
import { recordStatusChange } from "./order-lifecycle";
import { openIntentForOrder } from "./payment-intent";
import { requiresPaymentIntent } from "./payment-terms";
import { recordRedemptions } from "./promotion";

export interface CreateOrderContext {
  createdById: string;
  createdByRole: Role;
}

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: string;
  /** Total the campaigns took off, excl. VAT — 0.00 when none applied. */
  promotionTotal: string;
  /** Which campaigns applied, so the confirmation can name them. */
  promotions: Array<{ name: string; code: string | null; amount: string }>;
  /** Human hint for the UI about why it isn't CONFIRMED. */
  reason: "APPROVAL_REQUIRED" | "CREDIT_EXCEEDED" | null;
  /**
   * The card charge opened for this order, when it was paid by card.
   *
   * The caller takes it to `authorizeOpenIntent` once this transaction has
   * committed — the provider is a network hop and must not be made from inside
   * a database transaction. Null for every other payment method.
   */
  paymentIntentId: string | null;
}

type Tx = Prisma.TransactionClient;

/**
 * Create an order atomically:
 *  - prices the cart through buildQuote (MOQ / case / stock checks, company
 *    pricing, campaigns, VAT) — the very calculation the portal previewed
 *  - decides status (approval flow → credit check → confirmed)
 *  - reserves stock, records promotion redemptions, and on CONFIRMED+OPEN_ACCOUNT
 *    writes the cari DEBIT and bumps Company.currentBalance in the same transaction.
 *
 * The quote is re-run here inside the transaction rather than trusted from the
 * client: prices, stock and campaign quotas can all have moved since the preview.
 *
 * Retries once on an orderNumber collision (P2002) under concurrency.
 */
export async function createOrder(
  input: CreateOrderInput,
  ctx: CreateOrderContext,
): Promise<CreateOrderResult> {
  if (input.items.length === 0) {
    throw new BusinessError("EMPTY_ORDER", "Sepet boş olamaz");
  }

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => buildOrder(tx, input, ctx));
    } catch (err) {
      if (
        attempt < 2 &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue; // orderNumber raced — retry
      }
      throw err;
    }
  }
}

async function buildOrder(
  tx: Tx,
  input: CreateOrderInput,
  ctx: CreateOrderContext,
): Promise<CreateOrderResult> {
  // 1-3. Validate, price, discount, promote, total — shared with the preview.
  //
  // Freight is a seller-side figure: a buyer placing its own order cannot price
  // its delivery, so the field is ignored unless the caller sells.
  const isSeller =
    ctx.createdByRole === "SUPER_ADMIN" || ctx.createdByRole === "SALES_REP";
  const shippingFee = isSeller ? (input.shippingFee ?? 0) : 0;
  let paymentIntentId: string | null = null;

  const quote = await buildQuote(tx, {
    companyId: input.companyId,
    paymentMethod: input.paymentMethod,
    // Vade is validated inside the quote against what this customer was
    // offered, so the same rules apply to the preview and to the real order.
    paymentTermId: input.paymentTermId,
    paymentTermDays: input.paymentTermDays,
    isSeller,
    couponCode: input.couponCode,
    shippingFee,
    items: input.items,
  });
  const { company, subtotal, discountTotal, promotionTotal, taxTotal, grandTotal } =
    quote;

  const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = quote.lines.map(
    (l) => ({
      variant: { connect: { id: l.variantId } },
      productName: l.productName,
      sku: l.sku,
      quantity: l.quantity,
      caseCount: l.caseCount,
      unitPrice: l.unitPrice,
      discount: l.discountPerUnit,
      volumeDiscount: l.volumeDiscountPerUnit,
      promotionDiscount: l.promotionDiscount,
      vatRate: l.vatRate,
      lineTotal: l.lineNet,
      isGift: l.isGift,
    }),
  );
  const stockUpdates = quote.lines.map((l) => ({
    id: l.variantId,
    qty: l.quantity,
  }));

  // 4. Status decision
  const isStaff = ctx.createdByRole === "COMPANY_STAFF";
  let status: OrderStatus;
  let reason: CreateOrderResult["reason"] = null;

  if (company.requiresOrderApproval && isStaff) {
    status = "PENDING_APPROVAL";
    reason = "APPROVAL_REQUIRED";
  } else if (quote.terms.createsReceivable) {
    // Only credit sales are checked against the limit. Cash, transfer and card
    // take the money now, so they cannot push the cari anywhere.
    const projected = new Dec(company.currentBalance).add(grandTotal);
    if (projected.gt(company.creditLimit)) {
      status = "PENDING_CREDIT";
      reason = "CREDIT_EXCEEDED";
    } else {
      status = "CONFIRMED";
    }
  } else {
    status = "CONFIRMED"; // paid at order time
  }

  // 5. Reserve stock (all non-rejected orders hold stock)
  for (const s of stockUpdates) {
    await tx.productVariant.update({
      where: { id: s.id },
      data: { stock: { decrement: s.qty } },
    });
  }

  // 6. Human-readable order number (unique per day)
  const orderNumber = await nextOrderNumber(tx);

  // 7. Create order + item snapshots
  const order = await tx.order.create({
    data: {
      orderNumber,
      status,
      paymentMethod: input.paymentMethod,
      company: { connect: { id: company.id } },
      createdBy: { connect: { id: ctx.createdById } },
      ...(input.shippingAddressId
        ? { shippingAddress: { connect: { id: input.shippingAddressId } } }
        : {}),
      note: input.note ?? null,
      couponCode: quote.coupon,
      subtotal,
      discountTotal,
      promotionTotal,
      shippingFee: quote.shippingFee,
      shippingDiscount: quote.shippingDiscount,
      shippingVatRate: quote.shippingVatRate,
      taxTotal,
      grandTotal,
      // Already validated against this customer's menu; null falls back to the
      // company's default term.
      paymentTermDays: quote.terms.paymentTermDays,
      // Snapshot, not a reference: the rung may be renamed or retired, and this
      // order has to keep explaining its own prices.
      volumeTierName: quote.volumeDiscount?.tierName ?? null,
      volumeDiscountPercent: quote.volumeDiscount?.percent ?? 0,
      items: { create: itemsData },
    },
    select: { id: true, orderNumber: true, status: true },
  });

  // 8. Open the status timeline with the status the order was born in.
  await recordStatusChange(tx, {
    orderId: order.id,
    fromStatus: null,
    toStatus: status,
    changedById: ctx.createdById,
  });

  // 9. Book the campaign usage. Counted from these rows, and only counted while
  //    the order is alive, so a cancellation hands the quota back by itself.
  await recordRedemptions(tx, {
    orderId: order.id,
    companyId: company.id,
    applied: quote.appliedPromotions,
  });

  // 10. Cari DEBIT only when the order is immediately CONFIRMED on credit.
  //    Pending orders get their debit at approval/confirmation time.
  if (status === "CONFIRMED" && quote.terms.createsReceivable) {
    await tx.transaction.create({
      data: {
        company: { connect: { id: company.id } },
        type: "DEBIT",
        amount: grandTotal,
        paymentMethod: quote.terms.method,
        description: `Sipariş ${orderNumber}`,
        // No due date yet, deliberately. The vade starts with the invoice, so
        // until one is issued this debt ages from the order date plus the
        // company's term (see ledger.ts) — and writing a provisional date here
        // would fight the invoice when it eventually sets the real one.
        order: { connect: { id: order.id } },
        recordedBy: { connect: { id: ctx.createdById } },
      },
    });
    await tx.company.update({
      where: { id: company.id },
      data: { currentBalance: { increment: grandTotal } },
    });
  }

  // 11. Kasa/banka girişi for the other kind of order: the money is taken now,
  //    so the cari never hears about it and something else has to. Decided by
  //    the same table as step 10, from the opposite side.
  if (status === "CONFIRMED") {
    await postOrderCashIn(tx, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentMethod: quote.terms.method,
      grandTotal,
      actorId: ctx.createdById,
    });
  }

  // 12. …and for the one method that has to be *charged*, open the intent
  //     instead. The provider is not called here — that happens after this
  //     transaction commits, because a bank on the other end of a network hop
  //     must not be holding this order's row locks.
  if (status === "CONFIRMED" && requiresPaymentIntent(quote.terms.method)) {
    const opened = await openIntentForOrder(tx, {
      orderId: order.id,
      companyId: company.id,
      amount: grandTotal,
      actorId: ctx.createdById,
    });
    paymentIntentId = opened.intentId;
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    grandTotal: grandTotal.toFixed(2),
    promotionTotal: promotionTotal.toFixed(2),
    promotions: quote.appliedPromotions.map((p) => ({
      name: p.name,
      code: p.code,
      amount: p.amount.toFixed(2),
    })),
    reason,
    paymentIntentId,
  };
}

async function nextOrderNumber(tx: Tx): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dayStart = new Date(y, now.getMonth(), now.getDate());
  const dayEnd = new Date(y, now.getMonth(), now.getDate() + 1);

  const count = await tx.order.count({
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  });
  return `ORD-${y}${m}${d}-${String(count + 1).padStart(4, "0")}`;
}
