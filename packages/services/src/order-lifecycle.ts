import { Prisma, prisma } from "@repo/database";
import type { OrderStatus, Role } from "@repo/types";
import { BusinessError } from "./errors";

// What happens to an order after it is confirmed. Approval (PENDING_* → CONFIRMED
// / REJECTED) stays in order-approval.ts; this file owns the fulfilment path and
// cancellation, which is the only transition that has to undo money and stock.

type Tx = Prisma.TransactionClient;

/** Allowed next statuses. Anything not listed here is a terminal state. */
export const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> =
  {
    // DRAFT never becomes CONFIRMED here: confirmation has to run the credit
    // check, which lives in createOrder / approveOrder.
    DRAFT: ["CANCELLED"],
    PENDING_APPROVAL: [], // handled by approveOrder / rejectOrder
    PENDING_CREDIT: [],
    CONFIRMED: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
    REJECTED: [],
  };

/** Statuses only the seller side may set. */
const FULFILMENT_STATUSES: readonly OrderStatus[] = [
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];

export interface ChangeStatusContext {
  userId: string;
  role: Role;
  /** The actor's own company, for scoping COMPANY_ADMIN cancellations. */
  companyId: string | null;
}

export interface ChangeStatusInput {
  status: OrderStatus;
  note?: string;
  carrier?: string;
  trackingNumber?: string;
}

export interface ChangeStatusResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
}

type LoadedOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: "OPEN_ACCOUNT" | "CREDIT_CARD";
  grandTotal: Prisma.Decimal;
  companyId: string;
};

/**
 * Move an order to `input.status`.
 *
 *  - fulfilment (PROCESSING / SHIPPED / DELIVERED): SUPER_ADMIN only
 *  - CANCELLED: SUPER_ADMIN, or the buying company's own COMPANY_ADMIN, and only
 *    while the goods have not shipped
 *
 * Cancelling restocks every line and, if the order had already been debited to
 * the open account, writes a reversing CREDIT so the cari balance goes back to
 * where it was. All of it in one transaction.
 */
export async function changeOrderStatus(
  orderId: string,
  input: ChangeStatusInput,
  ctx: ChangeStatusContext,
): Promise<ChangeStatusResult> {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);

    assertTransitionAllowed(order.status, input.status);
    assertActorMay(order, input.status, ctx);

    if (input.status === "CANCELLED") {
      await restock(tx, order.id);
      await reverseDebit(tx, order, ctx.userId);
    }

    const now = new Date();
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: input.status,
        ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
        ...(input.trackingNumber !== undefined
          ? { trackingNumber: input.trackingNumber }
          : {}),
        ...(input.status === "SHIPPED" ? { shippedAt: now } : {}),
        ...(input.status === "DELIVERED" ? { deliveredAt: now } : {}),
        ...(input.status === "CANCELLED" ? { cancelledAt: now } : {}),
      },
      select: { orderNumber: true },
    });

    await recordStatusChange(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: input.status,
      changedById: ctx.userId,
      note: input.note,
    });

    return {
      orderId: order.id,
      orderNumber: updated.orderNumber,
      status: input.status,
    };
  });
}

/**
 * Append a status-history row. Exported so order creation and the approval flow
 * write to the same timeline — otherwise the trail would start mid-story.
 */
export async function recordStatusChange(
  tx: Tx,
  entry: {
    orderId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    changedById: string;
    note?: string;
  },
): Promise<void> {
  await tx.orderStatusHistory.create({
    data: {
      orderId: entry.orderId,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      changedById: entry.changedById,
      note: entry.note ?? null,
    },
  });
}

async function loadOrder(tx: Tx, orderId: string): Promise<LoadedOrder> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      grandTotal: true,
      companyId: true,
    },
  });
  if (!order) {
    throw new BusinessError("ORDER_NOT_FOUND", "Sipariş bulunamadı", { orderId });
  }
  return order;
}

function assertTransitionAllowed(from: OrderStatus, to: OrderStatus): void {
  if (from === to) {
    throw new BusinessError("INVALID_STATE", "Sipariş zaten bu durumda");
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BusinessError(
      "INVALID_STATE",
      `Sipariş ${from} durumundan ${to} durumuna geçirilemez`,
      { from, to },
    );
  }
}

function assertActorMay(
  order: LoadedOrder,
  to: OrderStatus,
  ctx: ChangeStatusContext,
): void {
  if (ctx.role === "SUPER_ADMIN") return;

  if (FULFILMENT_STATUSES.includes(to)) {
    throw new BusinessError(
      "FORBIDDEN",
      "Sevkiyat durumunu yalnızca süper admin değiştirebilir",
    );
  }

  // CANCELLED — the buying company may pull its own order back before shipment.
  if (
    ctx.role === "COMPANY_ADMIN" &&
    ctx.companyId === order.companyId &&
    (order.status === "CONFIRMED" || order.status === "PROCESSING")
  ) {
    return;
  }

  throw new BusinessError("FORBIDDEN", "Bu siparişi iptal etme yetkiniz yok");
}

async function restock(tx: Tx, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { variantId: true, quantity: true },
  });
  for (const it of items) {
    await tx.productVariant.update({
      where: { id: it.variantId },
      data: { stock: { increment: it.quantity } },
    });
  }
}

/**
 * Undo the cari debit written when the order was confirmed. Looks for the actual
 * DEBIT row rather than assuming: a CREDIT_CARD order never had one, and a
 * DRAFT cancellation happens before any debit exists.
 */
async function reverseDebit(
  tx: Tx,
  order: LoadedOrder,
  actorId: string,
): Promise<void> {
  const debit = await tx.transaction.findFirst({
    where: { orderId: order.id, type: "DEBIT" },
    select: { amount: true },
  });
  if (!debit) return;

  await tx.transaction.create({
    data: {
      company: { connect: { id: order.companyId } },
      type: "CREDIT",
      amount: debit.amount,
      paymentMethod: order.paymentMethod,
      description: `Sipariş ${order.orderNumber} iptali`,
      order: { connect: { id: order.id } },
      recordedBy: { connect: { id: actorId } },
    },
  });
  await tx.company.update({
    where: { id: order.companyId },
    data: { currentBalance: { decrement: debit.amount } },
  });
}

// ─────────────────────────────────────────────
// ORDER DETAIL
// ─────────────────────────────────────────────

export interface OrderDetailItem {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  vatRate: number;
  lineTotal: string;
}

export interface OrderStatusEvent {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedByName: string;
  note: string | null;
  createdAt: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: "OPEN_ACCOUNT" | "CREDIT_CARD";
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  currency: string;
  note: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  company: { id: string; name: string };
  createdByName: string;
  approvedByName: string | null;
  shippingAddress: {
    label: string;
    line1: string;
    city: string;
    district: string | null;
  } | null;
  items: OrderDetailItem[];
  history: OrderStatusEvent[];
  /** Statuses this caller may move the order to right now. */
  availableTransitions: OrderStatus[];
}

export async function getOrderDetail(
  orderId: string,
  ctx: ChangeStatusContext,
): Promise<OrderDetail> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      subtotal: true,
      discountTotal: true,
      taxTotal: true,
      grandTotal: true,
      currency: true,
      note: true,
      carrier: true,
      trackingNumber: true,
      createdAt: true,
      shippedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      companyId: true,
      company: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      shippingAddress: {
        select: { label: true, line1: true, city: true, district: true },
      },
      items: {
        select: {
          id: true,
          productName: true,
          sku: true,
          quantity: true,
          unitPrice: true,
          discount: true,
          vatRate: true,
          lineTotal: true,
        },
        orderBy: { productName: "asc" },
      },
      statusHistory: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          createdAt: true,
          changedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!o) {
    throw new BusinessError("ORDER_NOT_FOUND", "Sipariş bulunamadı", { orderId });
  }

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentMethod: o.paymentMethod,
    subtotal: o.subtotal.toFixed(2),
    discountTotal: o.discountTotal.toFixed(2),
    taxTotal: o.taxTotal.toFixed(2),
    grandTotal: o.grandTotal.toFixed(2),
    currency: o.currency,
    note: o.note,
    carrier: o.carrier,
    trackingNumber: o.trackingNumber,
    createdAt: o.createdAt.toISOString(),
    shippedAt: o.shippedAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    company: o.company,
    createdByName: o.createdBy.name,
    approvedByName: o.approvedBy?.name ?? null,
    shippingAddress: o.shippingAddress,
    items: o.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toFixed(2),
      discount: i.discount.toFixed(2),
      vatRate: i.vatRate,
      lineTotal: i.lineTotal.toFixed(2),
    })),
    history: o.statusHistory.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      changedByName: h.changedBy.name,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
    availableTransitions: transitionsFor(
      { id: o.id, orderNumber: o.orderNumber, status: o.status, paymentMethod: o.paymentMethod, grandTotal: o.grandTotal, companyId: o.companyId },
      ctx,
    ),
  };
}

/** Which of the allowed next statuses this caller is actually permitted to set. */
function transitionsFor(order: LoadedOrder, ctx: ChangeStatusContext): OrderStatus[] {
  return ALLOWED_TRANSITIONS[order.status].filter((to) => {
    try {
      assertActorMay(order, to, ctx);
      return true;
    } catch {
      return false;
    }
  });
}
