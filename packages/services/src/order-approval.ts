import { Prisma, prisma } from "@repo/database";
import type { OrderStatus, Role } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec } from "./money";

export interface ApprovalContext {
  approverId: string;
  approverRole: Role;
  /** The approver's own company (for COMPANY_ADMIN scoping); null for others. */
  approverCompanyId: string | null;
}

export interface ApprovalResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
}

type Tx = Prisma.TransactionClient;

type PendingOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: "OPEN_ACCOUNT" | "CREDIT_CARD";
  grandTotal: Prisma.Decimal;
  companyId: string;
  company: { creditLimit: Prisma.Decimal; currentBalance: Prisma.Decimal };
};

/**
 * Approve a pending order.
 *  - PENDING_APPROVAL: COMPANY_ADMIN (own company) or SUPER_ADMIN. Runs the
 *    credit check next → CONFIRMED (open account within limit / credit card)
 *    or PENDING_CREDIT (over limit, needs super admin).
 *  - PENDING_CREDIT: SUPER_ADMIN only → CONFIRMED (credit override).
 * Confirmation writes the cari DEBIT + bumps currentBalance for open account.
 */
export async function approveOrder(
  orderId: string,
  ctx: ApprovalContext,
): Promise<ApprovalResult> {
  return prisma.$transaction(async (tx) => {
    const order = await loadPending(tx, orderId);
    assertCanApprove(order, ctx);

    if (order.status === "PENDING_APPROVAL") {
      if (order.paymentMethod === "OPEN_ACCOUNT") {
        const projected = new Dec(order.company.currentBalance).add(
          order.grandTotal,
        );
        if (projected.gt(order.company.creditLimit)) {
          const updated = await tx.order.update({
            where: { id: order.id },
            data: { status: "PENDING_CREDIT", approvedById: ctx.approverId },
            select: { orderNumber: true },
          });
          return {
            orderId: order.id,
            orderNumber: updated.orderNumber,
            status: "PENDING_CREDIT",
          };
        }
      }
      return confirmAndDebit(tx, order, ctx);
    }

    if (order.status === "PENDING_CREDIT") {
      if (ctx.approverRole !== "SUPER_ADMIN") {
        throw new BusinessError(
          "FORBIDDEN_APPROVAL",
          "Kredi onayı yalnızca süper admin tarafından verilebilir",
        );
      }
      return confirmAndDebit(tx, order, ctx);
    }

    throw new BusinessError(
      "INVALID_STATE",
      `Sipariş ${order.status} durumunda onaylanamaz`,
    );
  });
}

/** Reject a pending order and restock its items. */
export async function rejectOrder(
  orderId: string,
  ctx: ApprovalContext,
): Promise<ApprovalResult> {
  return prisma.$transaction(async (tx) => {
    const order = await loadPending(tx, orderId);
    assertCanApprove(order, ctx);

    if (
      order.status !== "PENDING_APPROVAL" &&
      order.status !== "PENDING_CREDIT"
    ) {
      throw new BusinessError(
        "INVALID_STATE",
        `Sipariş ${order.status} durumunda reddedilemez`,
      );
    }

    const items = await tx.orderItem.findMany({
      where: { orderId: order.id },
      select: { variantId: true, quantity: true },
    });
    for (const it of items) {
      await tx.productVariant.update({
        where: { id: it.variantId },
        data: { stock: { increment: it.quantity } },
      });
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: "REJECTED", approvedById: ctx.approverId },
      select: { orderNumber: true },
    });
    return {
      orderId: order.id,
      orderNumber: updated.orderNumber,
      status: "REJECTED",
    };
  });
}

async function loadPending(tx: Tx, orderId: string): Promise<PendingOrder> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      grandTotal: true,
      companyId: true,
      company: { select: { creditLimit: true, currentBalance: true } },
    },
  });
  if (!order) {
    throw new BusinessError("ORDER_NOT_FOUND", "Sipariş bulunamadı", {
      orderId,
    });
  }
  return order;
}

function assertCanApprove(order: PendingOrder, ctx: ApprovalContext): void {
  if (ctx.approverRole === "SUPER_ADMIN") return;
  if (
    ctx.approverRole === "COMPANY_ADMIN" &&
    order.status === "PENDING_APPROVAL" &&
    ctx.approverCompanyId === order.companyId
  ) {
    return;
  }
  throw new BusinessError(
    "FORBIDDEN_APPROVAL",
    "Bu siparişi onaylama yetkiniz yok",
  );
}

async function confirmAndDebit(
  tx: Tx,
  order: PendingOrder,
  ctx: ApprovalContext,
): Promise<ApprovalResult> {
  const updated = await tx.order.update({
    where: { id: order.id },
    data: { status: "CONFIRMED", approvedById: ctx.approverId },
    select: { orderNumber: true },
  });

  if (order.paymentMethod === "OPEN_ACCOUNT") {
    await tx.transaction.create({
      data: {
        company: { connect: { id: order.companyId } },
        type: "DEBIT",
        amount: order.grandTotal,
        paymentMethod: "OPEN_ACCOUNT",
        description: `Sipariş ${order.orderNumber}`,
        order: { connect: { id: order.id } },
        recordedBy: { connect: { id: ctx.approverId } },
      },
    });
    await tx.company.update({
      where: { id: order.companyId },
      data: { currentBalance: { increment: order.grandTotal } },
    });
  }

  return {
    orderId: order.id,
    orderNumber: updated.orderNumber,
    status: "CONFIRMED",
  };
}
