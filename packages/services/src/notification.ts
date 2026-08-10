import type { OrderStatus } from "@prisma/client";
import { prisma } from "@repo/database";
import { recordAudit } from "./audit";
import { appUrl, sendMail, type MailResult } from "./mail";
import { sendPush } from "./push";
import {
  invoiceIssuedMail,
  orderPlacedMail,
  orderStatusMail,
} from "./mail-templates";

// Transactional notifications: an order was placed, its status moved, an
// invoice was cut.
//
// Two rules hold for everything in this file:
//
//  1. **It never throws.** A notification is an announcement about work that has
//     already been committed. If the mail server is down the order still exists,
//     so a failure is logged (and audited) and the caller carries on.
//  2. **It is called after the transaction, never inside one.** Sending mail
//     from inside `$transaction` would hold a database connection open for the
//     length of an SMTP round trip, and would announce a state that could still
//     roll back.
//
// Recipients are resolved from the data, not passed in, so a caller cannot
// accidentally leak an order to the wrong mailbox.

const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay bekliyor",
  PENDING_CREDIT: "Limit onayı bekliyor",
  CONFIRMED: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Sevk edildi",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
  REJECTED: "Reddedildi",
};

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

/** Unique, non-empty addresses. */
function recipients(...addresses: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const address of addresses) {
    const value = address?.trim().toLowerCase();
    if (value && value.includes("@")) seen.add(value);
  }
  return [...seen];
}

/**
 * Everyone at a company who should hear about its orders: the company admins,
 * plus the company's own address if one is on file.
 */
async function companyAudience(companyId: string): Promise<{
  name: string;
  emails: string[];
  salesRepEmail: string | null;
  /**
   * Aynı kitlenin telefon tarafı. E-posta bir adrese gider, push bir **hesaba**
   * — firmanın genel e-posta kutusunun karşılığı yok, bu yüzden liste yalnızca
   * gerçek kullanıcılardan oluşuyor.
   */
  memberIds: string[];
  salesRepId: string | null;
}> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      email: true,
      salesRep: { select: { id: true, email: true, isActive: true } },
      members: {
        where: { isActive: true, role: "COMPANY_ADMIN" },
        select: { id: true, email: true },
      },
    },
  });
  if (!company) {
    return {
      name: "",
      emails: [],
      salesRepEmail: null,
      memberIds: [],
      salesRepId: null,
    };
  }

  const rep = company.salesRep?.isActive ? company.salesRep : null;

  return {
    name: company.name,
    emails: recipients(company.email, ...company.members.map((m) => m.email)),
    salesRepEmail: rep?.email ?? null,
    memberIds: company.members.map((m) => m.id),
    salesRepId: rep?.id ?? null,
  };
}

/** Send, then leave a trace either way. Swallows every error by design. */
async function deliver(params: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  entity: string;
  entityId: string;
  summary: string;
}): Promise<MailResult | null> {
  if (params.to.length === 0) return null;

  let result: MailResult;
  try {
    result = await sendMail({
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {}),
    });
  } catch (err) {
    result = {
      ok: false,
      transport: "smtp",
      error: err instanceof Error ? err.message : "bilinmeyen hata",
    };
  }

  await recordAudit({
    // Nobody clicked "send" — the system did, as a consequence of a committed
    // change. The entity/entityId below is what makes the line meaningful.
    actor: { id: null, email: "sistem", role: null },
    action: result.ok ? "NOTIFICATION_SENT" : "NOTIFICATION_FAILED",
    summary: params.summary,
    entity: params.entity,
    entityId: params.entityId,
    meta: {
      to: params.to,
      transport: result.transport,
      ...(result.error ? { error: result.error } : {}),
    },
  }).catch(() => {
    // The audit trail is best-effort here too: a notification must not be able
    // to fail a request by failing to log that it failed.
  });

  return result;
}

/**
 * A new order exists. Company admins always hear about it; when the order is
 * waiting on them, so does the wording. The buyer who placed it is copied, and
 * the account's sales rep is told about orders that are already live (there is
 * nothing for a rep to do about an order still awaiting its own company's
 * approval).
 */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      status: true,
      grandTotal: true,
      companyId: true,
      createdById: true,
      createdBy: { select: { email: true } },
    },
  });
  if (!order) return;

  const audience = await companyAudience(order.companyId);
  const needsApproval =
    order.status === "PENDING_APPROVAL" || order.status === "PENDING_CREDIT";

  const to = recipients(
    ...audience.emails,
    order.createdBy.email,
    needsApproval ? null : audience.salesRepEmail,
  );

  const mail = orderPlacedMail({
    orderNumber: order.orderNumber,
    companyName: audience.name,
    grandTotal: order.grandTotal.toFixed(2),
    status: orderStatusLabel(order.status),
    needsApproval,
    link: appUrl(`/orders/${orderId}`),
  });

  await deliver({
    to,
    ...mail,
    entity: "Order",
    entityId: orderId,
    summary: `Sipariş bildirimi: ${order.orderNumber}`,
  });

  // Telefona düşen kısım siparişi **girenden** başkasına gidiyor: kendi
  // yaptığın işi sana bildiren bir uygulama, bir hafta sonra bildirimleri
  // kapattırır. Onay bekleyen bir sipariş firma yöneticisinin işi; canlıya
  // geçmiş bir sipariş plasiyerin haberi.
  await sendPush(
    [
      ...audience.memberIds,
      ...(needsApproval ? [] : [audience.salesRepId ?? ""]),
    ].filter((id) => id && id !== order.createdById),
    {
      title: needsApproval ? "Onay bekleyen sipariş" : "Yeni sipariş",
      body: `${audience.name} · ${order.orderNumber} · ${formatTotal(order.grandTotal)}`,
      data: { screen: "OrderDetail", orderId, orderNumber: order.orderNumber },
    },
  );
}

/** Bildirim metni için kısa tutar. Kuruş, iki satırlık bir bildirimde yer kaplar. */
function formatTotal(value: { toFixed(digits: number): string }): string {
  return `${Number(value.toFixed(2)).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₺`;
}

/**
 * The order moved. Only states the buyer can act on or cares about are
 * announced — walking an order through PROCESSING → SHIPPED should not put four
 * mails in someone's inbox for a change they triggered themselves.
 */
const ANNOUNCED_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REJECTED",
]);

export async function notifyOrderStatusChanged(
  orderId: string,
  status: OrderStatus,
  note?: string | null,
): Promise<void> {
  if (!ANNOUNCED_STATUSES.has(status)) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      companyId: true,
      createdById: true,
      createdBy: { select: { email: true } },
    },
  });
  if (!order) return;

  const audience = await companyAudience(order.companyId);
  const to = recipients(...audience.emails, order.createdBy.email);

  const mail = orderStatusMail({
    orderNumber: order.orderNumber,
    status: orderStatusLabel(status),
    note: note ?? null,
    link: appUrl(`/orders/${orderId}`),
  });

  await deliver({
    to,
    ...mail,
    entity: "Order",
    entityId: orderId,
    summary: `Sipariş durum bildirimi: ${order.orderNumber} → ${status}`,
  });

  // Durum değişimi siparişi girenin beklediği haber — onaylandı mı, yola çıktı
  // mı. Firma yöneticileri de listede: onay kendilerinde olmasa bile firmanın
  // siparişinin reddedildiğini duymaları gerekiyor.
  await sendPush([order.createdById, ...audience.memberIds], {
    title: `Sipariş ${orderStatusLabel(status).toLocaleLowerCase("tr")}`,
    body: `${order.orderNumber}${note ? ` · ${note}` : ""}`,
    data: { screen: "OrderDetail", orderId, orderNumber: order.orderNumber },
  });
}

/** An invoice was issued. This one starts a payment clock, so it always goes. */
export async function notifyInvoiceIssued(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      documentNumber: true,
      grandTotal: true,
      dueDate: true,
      companyId: true,
      orderId: true,
      order: { select: { orderNumber: true, createdBy: { select: { email: true } } } },
    },
  });
  if (!invoice) return;

  const audience = await companyAudience(invoice.companyId);
  const to = recipients(...audience.emails, invoice.order.createdBy.email);

  const mail = invoiceIssuedMail({
    documentNumber: invoice.documentNumber,
    orderNumber: invoice.order.orderNumber,
    grandTotal: invoice.grandTotal.toFixed(2),
    dueDate: invoice.dueDate.toLocaleDateString("tr-TR"),
    link: appUrl(`/documents/invoices/${invoiceId}`),
  });

  await deliver({
    to,
    ...mail,
    entity: "Invoice",
    entityId: invoiceId,
    summary: `Fatura bildirimi: ${invoice.documentNumber}`,
  });
}
