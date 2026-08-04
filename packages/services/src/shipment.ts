import { Prisma, prisma } from "@repo/database";
import type { CreateShipmentInput, OrderStatus, Role } from "@repo/types";
import { BusinessError } from "./errors";
import { resolveDocumentNumber } from "./document-series";
import { recordStatusChange } from "./order-lifecycle";

// Partial despatch (irsaliye).
//
// An order is not necessarily shipped in one go: stock arrives, part of the
// order leaves, the rest waits. Each despatch is its own document with its own
// number, and the order's status is derived from what is left rather than set by
// hand — PROCESSING while anything is outstanding, SHIPPED when nothing is.

type Client = Prisma.TransactionClient;

/** Statuses from which goods may leave the building. */
const SHIPPABLE: readonly OrderStatus[] = ["CONFIRMED", "PROCESSING"];

export interface ShipmentContext {
  userId: string;
  role: Role;
}

export interface ShipmentLineView {
  orderItemId: string;
  productName: string;
  sku: string;
  quantity: number;
}

export interface ShipmentView {
  id: string;
  documentNumber: string;
  externalNumber: string | null;
  shippedAt: string;
  carrier: string | null;
  trackingNumber: string | null;
  note: string | null;
  shippedByName: string;
  /** Number of the invoice that billed it, if any. */
  invoiceId: string | null;
  invoiceNumber: string | null;
  items: ShipmentLineView[];
}

/** What is still waiting to leave, per order line. */
export interface OpenLine {
  orderItemId: string;
  productName: string;
  sku: string;
  quantity: number;
  quantityShipped: number;
  quantityInvoiced: number;
  remainingToShip: number;
  remainingToInvoice: number;
}

export async function createShipment(
  orderId: string,
  input: CreateShipmentInput,
  ctx: ShipmentContext,
): Promise<{ shipmentId: string; documentNumber: string; orderStatus: OrderStatus }> {
  if (ctx.role !== "SUPER_ADMIN") {
    throw new BusinessError("FORBIDDEN", "Sevkiyat yalnızca süper admin tarafından yapılır");
  }
  if (input.items.length === 0) {
    throw new BusinessError("EMPTY_SHIPMENT", "Sevk edilecek kalem seçilmedi");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        orderNumber: true,
        items: {
          select: {
            id: true,
            productName: true,
            sku: true,
            quantity: true,
            quantityShipped: true,
          },
        },
      },
    });
    if (!order) {
      throw new BusinessError("ORDER_NOT_FOUND", "Sipariş bulunamadı", { orderId });
    }
    if (!SHIPPABLE.includes(order.status)) {
      throw new BusinessError(
        "INVALID_STATE",
        `${order.status} durumundaki siparişten sevkiyat yapılamaz`,
        { status: order.status },
      );
    }

    const byId = new Map(order.items.map((i) => [i.id, i]));

    for (const line of input.items) {
      const item = byId.get(line.orderItemId);
      if (!item) {
        throw new BusinessError("ORDER_ITEM_NOT_FOUND", "Sipariş kalemi bulunamadı", {
          orderItemId: line.orderItemId,
        });
      }
      const remaining = item.quantity - item.quantityShipped;
      if (line.quantity > remaining) {
        throw new BusinessError(
          "OVER_SHIPMENT",
          `${item.sku}: sevk edilebilecek en fazla ${remaining} adet kaldı`,
          { sku: item.sku, remaining },
        );
      }
    }

    const { documentNumber, externalNumber } = await resolveDocumentNumber(
      tx,
      "WAYBILL",
      input.externalNumber,
    );

    const shipment = await tx.shipment.create({
      data: {
        orderId: order.id,
        documentNumber,
        externalNumber,
        carrier: input.carrier ?? null,
        trackingNumber: input.trackingNumber ?? null,
        note: input.note ?? null,
        shippedById: ctx.userId,
        ...(input.shippedAt ? { shippedAt: new Date(input.shippedAt) } : {}),
        items: {
          create: input.items.map((l) => ({
            orderItemId: l.orderItemId,
            quantity: l.quantity,
          })),
        },
      },
      select: { id: true, documentNumber: true },
    });

    for (const line of input.items) {
      await tx.orderItem.update({
        where: { id: line.orderItemId },
        data: { quantityShipped: { increment: line.quantity } },
      });
    }

    const orderStatus = await syncFulfilmentStatus(tx, order.id, order.status, ctx, {
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
    });

    return { shipmentId: shipment.id, documentNumber: shipment.documentNumber, orderStatus };
  });
}

/**
 * Recompute the order's status from what has actually left.
 *
 * Nothing shipped → leave it alone. Some shipped → PROCESSING. All shipped →
 * SHIPPED. The status is a consequence of the despatch records, so cancelling a
 * shipment walks it back the same way.
 */
async function syncFulfilmentStatus(
  tx: Client,
  orderId: string,
  fromStatus: OrderStatus,
  ctx: ShipmentContext,
  shipping: { carrier?: string; trackingNumber?: string } = {},
): Promise<OrderStatus> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { quantity: true, quantityShipped: true },
  });

  const anyShipped = items.some((i) => i.quantityShipped > 0);
  const allShipped = items.every((i) => i.quantityShipped >= i.quantity);

  let next: OrderStatus;
  if (allShipped) next = "SHIPPED";
  else if (anyShipped) next = "PROCESSING";
  else next = fromStatus === "PROCESSING" ? "CONFIRMED" : fromStatus;

  if (next === fromStatus) return fromStatus;

  await tx.order.update({
    where: { id: orderId },
    data: {
      status: next,
      ...(next === "SHIPPED" ? { shippedAt: new Date() } : {}),
      // A cancelled shipment un-ships the order; the despatch stamps go with it.
      ...(next !== "SHIPPED" ? { shippedAt: null } : {}),
      ...(shipping.carrier !== undefined ? { carrier: shipping.carrier } : {}),
      ...(shipping.trackingNumber !== undefined
        ? { trackingNumber: shipping.trackingNumber }
        : {}),
    },
  });
  await recordStatusChange(tx, {
    orderId,
    fromStatus,
    toStatus: next,
    changedById: ctx.userId,
    note: next === "SHIPPED" ? "Tüm kalemler sevk edildi" : "Kısmi sevkiyat",
  });
  return next;
}

/**
 * Undo a despatch that should not have been recorded. Refused once the shipment
 * has been invoiced: the invoice is the document that already went to the
 * customer, so the invoice has to be cancelled first.
 */
export async function cancelShipment(
  shipmentId: string,
  ctx: ShipmentContext,
): Promise<{ orderStatus: OrderStatus }> {
  if (ctx.role !== "SUPER_ADMIN") {
    throw new BusinessError("FORBIDDEN", "İrsaliye iptali yalnızca süper adminde");
  }

  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        invoiceId: true,
        orderId: true,
        order: { select: { status: true } },
        items: { select: { orderItemId: true, quantity: true } },
      },
    });
    if (!shipment) {
      throw new BusinessError("SHIPMENT_NOT_FOUND", "İrsaliye bulunamadı");
    }
    if (shipment.invoiceId) {
      throw new BusinessError(
        "INVALID_STATE",
        "Faturalanmış irsaliye iptal edilemez — önce faturayı iptal edin",
      );
    }

    for (const line of shipment.items) {
      await tx.orderItem.update({
        where: { id: line.orderItemId },
        data: { quantityShipped: { decrement: line.quantity } },
      });
    }
    // The number stays spent: deleting the row does not give it back, and it
    // must never be handed to a different document.
    await tx.shipment.delete({ where: { id: shipment.id } });

    const orderStatus = await syncFulfilmentStatus(
      tx,
      shipment.orderId,
      shipment.order.status,
      ctx,
    );
    return { orderStatus };
  });
}

export async function listShipments(orderId: string): Promise<ShipmentView[]> {
  const rows = await prisma.shipment.findMany({
    where: { orderId },
    select: {
      id: true,
      documentNumber: true,
      externalNumber: true,
      shippedAt: true,
      carrier: true,
      trackingNumber: true,
      note: true,
      invoiceId: true,
      invoice: { select: { documentNumber: true } },
      shippedBy: { select: { name: true } },
      items: {
        select: {
          orderItemId: true,
          quantity: true,
          orderItem: { select: { productName: true, sku: true } },
        },
      },
    },
    orderBy: { shippedAt: "asc" },
  });

  return rows.map((s) => ({
    id: s.id,
    documentNumber: s.documentNumber,
    externalNumber: s.externalNumber,
    shippedAt: s.shippedAt.toISOString(),
    carrier: s.carrier,
    trackingNumber: s.trackingNumber,
    note: s.note,
    shippedByName: s.shippedBy.name,
    invoiceId: s.invoiceId,
    invoiceNumber: s.invoice?.documentNumber ?? null,
    items: s.items.map((i) => ({
      orderItemId: i.orderItemId,
      productName: i.orderItem.productName,
      sku: i.orderItem.sku,
      quantity: i.quantity,
    })),
  }));
}

/** Per-line fulfilment state, for the despatch and invoice forms. */
export async function getOpenLines(orderId: string): Promise<OpenLine[]> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: {
      id: true,
      productName: true,
      sku: true,
      quantity: true,
      quantityShipped: true,
      quantityInvoiced: true,
    },
    orderBy: { productName: "asc" },
  });

  return items.map((i) => ({
    orderItemId: i.id,
    productName: i.productName,
    sku: i.sku,
    quantity: i.quantity,
    quantityShipped: i.quantityShipped,
    quantityInvoiced: i.quantityInvoiced,
    remainingToShip: i.quantity - i.quantityShipped,
    remainingToInvoice: i.quantity - i.quantityInvoiced,
  }));
}
