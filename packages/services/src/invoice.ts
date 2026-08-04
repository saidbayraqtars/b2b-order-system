import { Prisma, prisma } from "@repo/database";
import type { CreateInvoiceInput, InvoiceStatus, Role } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, ZERO, round2 } from "./money";
import type { Money } from "./money";
import { resolveDocumentNumber } from "./document-series";

// Faturalama.
//
// An invoice bills quantities, not orders: an order shipped in three despatches
// can be invoiced once, three times, or anywhere in between. What it may bill is
// bounded by what has been ordered and (when raised from despatches) by what has
// actually left.
//
// Money is not recomputed here. Prices, discounts and the campaign allocation
// were frozen on the order line; an invoice takes a *share* of them proportional
// to the quantity it bills, and the last invoice for a line takes whatever the
// rounding left behind, so the invoices of an order always sum back to the order.
//
// The cari debit is NOT re-created per invoice. The debt was booked when the
// order was confirmed — that is what the credit limit meters — so what the
// invoice does to the ledger is stamp the due date, because the vade starts with
// the invoice and not with the order.

type Client = Prisma.TransactionClient;

export interface InvoiceContext {
  userId: string;
  role: Role;
}

export interface InvoiceLineView {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  promotionDiscount: string;
  vatRate: number;
  lineTotal: string;
}

export interface InvoiceView {
  id: string;
  documentNumber: string;
  externalNumber: string | null;
  status: InvoiceStatus;
  issuedAt: string;
  dueDate: string;
  subtotal: string;
  discountTotal: string;
  promotionTotal: string;
  shippingFee: string;
  taxTotal: string;
  grandTotal: string;
  currency: string;
  note: string | null;
  createdByName: string;
  orderId: string;
  orderNumber: string;
  company: { id: string; name: string; taxNumber: string | null; taxOffice: string | null };
  items: InvoiceLineView[];
  shipmentNumbers: string[];
}

export async function createInvoice(
  orderId: string,
  input: CreateInvoiceInput,
  ctx: InvoiceContext,
): Promise<{ invoiceId: string; documentNumber: string; grandTotal: string }> {
  if (ctx.role !== "SUPER_ADMIN") {
    throw new BusinessError("FORBIDDEN", "Fatura kesme yetkisi yalnızca süper adminde");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        companyId: true,
        currency: true,
        shippingFee: true,
        shippingVatRate: true,
        paymentTermDays: true,
        company: { select: { paymentTermDays: true } },
        items: {
          select: {
            id: true,
            productName: true,
            sku: true,
            quantity: true,
            quantityShipped: true,
            quantityInvoiced: true,
            unitPrice: true,
            discount: true,
            promotionDiscount: true,
            vatRate: true,
            invoiceItems: {
              where: { invoice: { status: "ISSUED" } },
              select: { promotionDiscount: true },
            },
          },
        },
      },
    });
    if (!order) {
      throw new BusinessError("ORDER_NOT_FOUND", "Sipariş bulunamadı", { orderId });
    }
    if (order.status === "CANCELLED" || order.status === "REJECTED") {
      throw new BusinessError(
        "INVALID_STATE",
        "İptal edilmiş siparişe fatura kesilemez",
      );
    }

    const shipmentIds = input.shipmentIds ?? [];
    const quantities = shipmentIds.length
      ? await quantitiesFromShipments(tx, order.id, shipmentIds)
      : quantitiesFromOrder(order.items);

    if (quantities.size === 0) {
      throw new BusinessError(
        "NOTHING_TO_INVOICE",
        "Faturalanacak kalem yok — sipariş tamamen faturalanmış",
      );
    }

    // ── Lines: a share of the frozen figures, never a fresh calculation ──
    const itemsData: Prisma.InvoiceItemCreateWithoutInvoiceInput[] = [];
    let subtotal = ZERO;
    let discountTotal = ZERO;
    let promotionTotal = ZERO;
    let taxTotal = ZERO;

    for (const item of order.items) {
      const qty = quantities.get(item.id) ?? 0;
      if (qty === 0) continue;

      const remainingToInvoice = item.quantity - item.quantityInvoiced;
      if (qty > remainingToInvoice) {
        throw new BusinessError(
          "OVER_INVOICE",
          `${item.sku}: faturalanabilecek en fazla ${remainingToInvoice} adet kaldı`,
          { sku: item.sku, remaining: remainingToInvoice },
        );
      }

      const promoShare = allocatePromotion(item, qty, remainingToInvoice);
      const gross = round2(item.unitPrice.mul(qty));
      const lineDiscount = round2(item.discount.mul(qty));
      const lineTotal = round2(gross.sub(lineDiscount).sub(promoShare));
      const lineTax = round2(lineTotal.mul(item.vatRate).div(100));

      subtotal = subtotal.add(gross);
      discountTotal = discountTotal.add(lineDiscount);
      promotionTotal = promotionTotal.add(promoShare);
      taxTotal = taxTotal.add(lineTax);

      itemsData.push({
        orderItem: { connect: { id: item.id } },
        productName: item.productName,
        sku: item.sku,
        quantity: qty,
        unitPrice: item.unitPrice,
        discount: item.discount,
        promotionDiscount: promoShare,
        vatRate: item.vatRate,
        lineTotal,
      });
    }

    // ── Freight rides on the first invoice of the order, in full ──
    const alreadyInvoiced = await tx.invoice.count({
      where: { orderId: order.id, status: "ISSUED" },
    });
    const shippingFee =
      alreadyInvoiced === 0 ? round2(new Dec(order.shippingFee)) : ZERO;
    if (shippingFee.gt(ZERO)) {
      taxTotal = taxTotal.add(
        round2(shippingFee.mul(order.shippingVatRate).div(100)),
      );
    }

    subtotal = round2(subtotal);
    discountTotal = round2(discountTotal);
    promotionTotal = round2(promotionTotal);
    taxTotal = round2(taxTotal);
    const grandTotal = round2(
      subtotal.sub(discountTotal).sub(promotionTotal).add(shippingFee).add(taxTotal),
    );

    const issuedAt = input.issuedAt ? new Date(input.issuedAt) : new Date();
    const termDays = order.paymentTermDays ?? order.company.paymentTermDays;
    const dueDate = input.dueDate
      ? new Date(input.dueDate)
      : addDays(issuedAt, termDays);

    const { documentNumber, externalNumber } = await resolveDocumentNumber(
      tx,
      "INVOICE",
      input.externalNumber,
    );

    const invoice = await tx.invoice.create({
      data: {
        orderId: order.id,
        companyId: order.companyId,
        documentNumber,
        externalNumber,
        issuedAt,
        dueDate,
        subtotal,
        discountTotal,
        promotionTotal,
        shippingFee,
        taxTotal,
        grandTotal,
        currency: order.currency,
        note: input.note ?? null,
        createdById: ctx.userId,
        items: { create: itemsData },
      },
      select: { id: true, documentNumber: true },
    });

    for (const [orderItemId, qty] of quantities) {
      if (qty === 0) continue;
      await tx.orderItem.update({
        where: { id: orderItemId },
        data: { quantityInvoiced: { increment: qty } },
      });
    }
    if (shipmentIds.length) {
      await tx.shipment.updateMany({
        where: { id: { in: shipmentIds } },
        data: { invoiceId: invoice.id },
      });
    }

    await stampDueDate(tx, order.id, dueDate);

    return {
      invoiceId: invoice.id,
      documentNumber: invoice.documentNumber,
      grandTotal: grandTotal.toFixed(2),
    };
  });
}

type OrderItemForInvoice = {
  id: string;
  quantity: number;
  quantityShipped: number;
  quantityInvoiced: number;
  promotionDiscount: Money;
  invoiceItems: { promotionDiscount: Money }[];
};

/**
 * This invoice's share of the line's campaign discount.
 *
 * Proportional to quantity, except for the invoice that closes the line: that
 * one takes everything not yet allocated, so three invoices of 1/3 of a 10,00 ₺
 * discount come to 10,00 ₺ and not 9,99 ₺.
 */
function allocatePromotion(
  item: OrderItemForInvoice,
  qty: number,
  remainingToInvoice: number,
): Money {
  const total = new Dec(item.promotionDiscount);
  if (total.lte(ZERO)) return ZERO;

  const allocated = item.invoiceItems.reduce<Money>(
    (sum, i) => sum.add(i.promotionDiscount),
    ZERO,
  );
  const left = total.sub(allocated);
  if (left.lte(ZERO)) return ZERO;

  if (qty >= remainingToInvoice) return round2(left); // closes the line

  const share = round2(total.mul(qty).div(item.quantity));
  return share.gt(left) ? round2(left) : share;
}

/** Uninvoiced quantities taken from despatches — the irsaliyeli fatura case. */
async function quantitiesFromShipments(
  tx: Client,
  orderId: string,
  shipmentIds: string[],
): Promise<Map<string, number>> {
  const shipments = await tx.shipment.findMany({
    where: { id: { in: shipmentIds } },
    select: {
      id: true,
      orderId: true,
      invoiceId: true,
      items: { select: { orderItemId: true, quantity: true } },
    },
  });

  if (shipments.length !== shipmentIds.length) {
    throw new BusinessError("SHIPMENT_NOT_FOUND", "İrsaliye bulunamadı");
  }
  for (const s of shipments) {
    if (s.orderId !== orderId) {
      throw new BusinessError(
        "INVALID_STATE",
        "İrsaliye bu siparişe ait değil",
        { shipmentId: s.id },
      );
    }
    if (s.invoiceId) {
      throw new BusinessError(
        "ALREADY_INVOICED",
        "İrsaliye zaten faturalanmış",
        { shipmentId: s.id },
      );
    }
  }

  const out = new Map<string, number>();
  for (const s of shipments) {
    for (const line of s.items) {
      out.set(line.orderItemId, (out.get(line.orderItemId) ?? 0) + line.quantity);
    }
  }
  return out;
}

/** Everything on the order that has not been billed yet. */
function quantitiesFromOrder(
  items: Array<{ id: string; quantity: number; quantityInvoiced: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const left = item.quantity - item.quantityInvoiced;
    if (left > 0) out.set(item.id, left);
  }
  return out;
}

/**
 * Put the invoice's due date on the order's cari debit.
 *
 * The debit was written once, when the order was confirmed, and deliberately
 * without a due date — until an invoice exists there is no vade to speak of, and
 * a provisional date here would silently beat a back-dated invoice.
 *
 * The first invoice therefore sets it outright, whatever the date. When several
 * invoices point at the same debit the latest of them wins: an account is not
 * overdue while any part of it is still within term.
 */
async function stampDueDate(tx: Client, orderId: string, dueDate: Date): Promise<void> {
  const debit = await tx.transaction.findFirst({
    where: { orderId, type: "DEBIT" },
    select: { id: true, dueDate: true },
  });
  if (!debit) return; // credit-card order, or one still awaiting approval
  if (debit.dueDate && debit.dueDate >= dueDate) return;

  await tx.transaction.update({
    where: { id: debit.id },
    data: { dueDate },
  });
}

/**
 * Cancel an invoice. The number is spent for good — an issued number is never
 * handed to another document — but the quantities go back to being invoiceable
 * and any despatch it billed is released.
 */
export async function cancelInvoice(
  invoiceId: string,
  ctx: InvoiceContext,
): Promise<void> {
  if (ctx.role !== "SUPER_ADMIN") {
    throw new BusinessError("FORBIDDEN", "Fatura iptali yalnızca süper adminde");
  }

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        items: { select: { orderItemId: true, quantity: true } },
      },
    });
    if (!invoice) {
      throw new BusinessError("INVOICE_NOT_FOUND", "Fatura bulunamadı");
    }
    if (invoice.status === "CANCELLED") {
      throw new BusinessError("INVALID_STATE", "Fatura zaten iptal edilmiş");
    }

    for (const line of invoice.items) {
      if (!line.orderItemId) continue;
      await tx.orderItem.update({
        where: { id: line.orderItemId },
        data: { quantityInvoiced: { decrement: line.quantity } },
      });
    }
    await tx.shipment.updateMany({
      where: { invoiceId: invoice.id },
      data: { invoiceId: null },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "CANCELLED" },
    });
  });
}

export async function listInvoices(orderId: string): Promise<InvoiceView[]> {
  const rows = await prisma.invoice.findMany({
    where: { orderId },
    orderBy: { issuedAt: "asc" },
    select: invoiceSelect,
  });
  return rows.map(toView);
}

export async function getInvoice(invoiceId: string): Promise<InvoiceView> {
  const row = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: invoiceSelect,
  });
  if (!row) throw new BusinessError("INVOICE_NOT_FOUND", "Fatura bulunamadı");
  return toView(row);
}

const invoiceSelect = {
  id: true,
  documentNumber: true,
  externalNumber: true,
  status: true,
  issuedAt: true,
  dueDate: true,
  subtotal: true,
  discountTotal: true,
  promotionTotal: true,
  shippingFee: true,
  taxTotal: true,
  grandTotal: true,
  currency: true,
  note: true,
  orderId: true,
  order: { select: { orderNumber: true } },
  createdBy: { select: { name: true } },
  company: {
    select: { id: true, name: true, taxNumber: true, taxOffice: true },
  },
  items: {
    select: {
      id: true,
      productName: true,
      sku: true,
      quantity: true,
      unitPrice: true,
      discount: true,
      promotionDiscount: true,
      vatRate: true,
      lineTotal: true,
    },
    orderBy: { productName: "asc" },
  },
  shipments: { select: { documentNumber: true } },
} satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;

function toView(r: InvoiceRow): InvoiceView {
  return {
    id: r.id,
    documentNumber: r.documentNumber,
    externalNumber: r.externalNumber,
    status: r.status,
    issuedAt: r.issuedAt.toISOString(),
    dueDate: r.dueDate.toISOString(),
    subtotal: r.subtotal.toFixed(2),
    discountTotal: r.discountTotal.toFixed(2),
    promotionTotal: r.promotionTotal.toFixed(2),
    shippingFee: r.shippingFee.toFixed(2),
    taxTotal: r.taxTotal.toFixed(2),
    grandTotal: r.grandTotal.toFixed(2),
    currency: r.currency,
    note: r.note,
    createdByName: r.createdBy.name,
    orderId: r.orderId,
    orderNumber: r.order.orderNumber,
    company: r.company,
    items: r.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toFixed(2),
      discount: i.discount.toFixed(2),
      promotionDiscount: i.promotionDiscount.toFixed(2),
      vatRate: i.vatRate,
      lineTotal: i.lineTotal.toFixed(2),
    })),
    shipmentNumbers: r.shipments.map((s) => s.documentNumber),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}
