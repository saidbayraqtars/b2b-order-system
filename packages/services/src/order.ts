import { Prisma, prisma } from "@repo/database";
import type { CreateOrderInput, OrderStatus, Role } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, ZERO, round2 } from "./money";
import { resolvePrice } from "./pricing";

export interface CreateOrderContext {
  createdById: string;
  createdByRole: Role;
}

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: string;
  /** Human hint for the UI about why it isn't CONFIRMED. */
  reason: "APPROVAL_REQUIRED" | "CREDIT_EXCEEDED" | null;
}

type Tx = Prisma.TransactionClient;

/**
 * Create an order atomically:
 *  - validates MOQ / case-multiple / stock per line
 *  - resolves company-specific pricing + VAT
 *  - decides status (approval flow → credit check → confirmed)
 *  - reserves stock, and on CONFIRMED+OPEN_ACCOUNT writes the cari DEBIT
 *    and bumps Company.currentBalance in the same transaction.
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
  // 1. Company + its discounts
  const company = await tx.company.findUnique({
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

  // 2. Variants (+ product for VAT / name / category)
  const variantIds = input.items.map((i) => i.variantId);
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
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

  // 3. Build line snapshots + running totals
  let subtotal = ZERO;
  let discountTotal = ZERO;
  let taxTotal = ZERO;
  const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
  const stockUpdates: Array<{ id: string; qty: number }> = [];

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

    const lineGross = r.unitPrice.mul(item.quantity);
    const lineDiscount = r.discountPerUnit.mul(item.quantity);
    const lineTax = r.lineNet.mul(v.product.vatRate).div(100);

    subtotal = subtotal.add(lineGross);
    discountTotal = discountTotal.add(lineDiscount);
    taxTotal = taxTotal.add(lineTax);

    itemsData.push({
      variant: { connect: { id: v.id } },
      productName: v.product.name,
      sku: v.sku,
      quantity: item.quantity,
      caseCount: v.unitsPerCase > 1 ? item.quantity / v.unitsPerCase : null,
      unitPrice: r.unitPrice,
      discount: r.discountPerUnit,
      vatRate: v.product.vatRate,
      lineTotal: r.lineNet,
    });
    stockUpdates.push({ id: v.id, qty: item.quantity });
  }

  subtotal = round2(subtotal);
  discountTotal = round2(discountTotal);
  taxTotal = round2(taxTotal);
  const grandTotal = round2(subtotal.sub(discountTotal).add(taxTotal));

  // 4. Status decision
  const isStaff = ctx.createdByRole === "COMPANY_STAFF";
  let status: OrderStatus;
  let reason: CreateOrderResult["reason"] = null;

  if (company.requiresOrderApproval && isStaff) {
    status = "PENDING_APPROVAL";
    reason = "APPROVAL_REQUIRED";
  } else if (input.paymentMethod === "OPEN_ACCOUNT") {
    const projected = new Dec(company.currentBalance).add(grandTotal);
    if (projected.gt(company.creditLimit)) {
      status = "PENDING_CREDIT";
      reason = "CREDIT_EXCEEDED";
    } else {
      status = "CONFIRMED";
    }
  } else {
    status = "CONFIRMED"; // CREDIT_CARD assumed paid at order time
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
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      items: { create: itemsData },
    },
    select: { id: true, orderNumber: true, status: true },
  });

  // 8. Cari DEBIT only when the order is immediately CONFIRMED on open account.
  //    Pending orders get their debit at approval/confirmation time.
  if (status === "CONFIRMED" && input.paymentMethod === "OPEN_ACCOUNT") {
    await tx.transaction.create({
      data: {
        company: { connect: { id: company.id } },
        type: "DEBIT",
        amount: grandTotal,
        paymentMethod: "OPEN_ACCOUNT",
        description: `Sipariş ${orderNumber}`,
        order: { connect: { id: order.id } },
        recordedBy: { connect: { id: ctx.createdById } },
      },
    });
    await tx.company.update({
      where: { id: company.id },
      data: { currentBalance: { increment: grandTotal } },
    });
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    grandTotal: grandTotal.toFixed(2),
    reason,
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
