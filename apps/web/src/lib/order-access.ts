import { prisma } from "@repo/database";
import type { SessionUser } from "@repo/types";
import { AuthError } from "./guard";
import { resolveCompanyId } from "./company-access";

/**
 * Authorize a caller against one order by going through its company, so a sales
 * rep stays inside their portfolio and a buyer inside their own firm.
 *
 * A missing order answers 403 rather than 404 on purpose: an id that does not
 * exist and an id belonging to someone else must be indistinguishable, or the
 * endpoint becomes a way to probe for other companies' order ids.
 */
export async function assertOrderVisible(
  user: SessionUser,
  orderId: string,
): Promise<{ companyId: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { companyId: true },
  });
  if (!order) throw new AuthError(403, "Bu siparişe erişiminiz yok");

  await resolveCompanyId(user, order.companyId);
  return order;
}

/** Same rule, reached from a document that belongs to an order. */
export async function assertInvoiceVisible(
  user: SessionUser,
  invoiceId: string,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { companyId: true },
  });
  if (!invoice) throw new AuthError(403, "Bu faturaya erişiminiz yok");
  await resolveCompanyId(user, invoice.companyId);
}

export async function assertShipmentVisible(
  user: SessionUser,
  shipmentId: string,
): Promise<void> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { order: { select: { companyId: true } } },
  });
  if (!shipment) throw new AuthError(403, "Bu irsaliyeye erişiminiz yok");
  await resolveCompanyId(user, shipment.order.companyId);
}
