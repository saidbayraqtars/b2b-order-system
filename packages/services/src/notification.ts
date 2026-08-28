import type { OrderStatus } from "@prisma/client";
import { prisma } from "@repo/database";
import type { NotificationEvent } from "@repo/types";
import { recordAudit } from "./audit";
import { appUrl } from "./mail";
import { broadcast, type NotificationMessage } from "./notification-channel";
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

/** Bildirimi alacak bir kişi: kimliği **ve** adresi bir arada. */
export interface Listener {
  id: string;
  email: string;
  /** Susturduğu olaylar — kanal seçimi değil, olay seçimi. */
  muted: readonly string[];
}

/**
 * Everyone at a company who should hear about its orders: the company admins,
 * plus the company's own address if one is on file.
 */
async function companyAudience(companyId: string): Promise<{
  name: string;
  /** Firmanın genel posta kutusu — bir hesaba ait değil, susturulamıyor. */
  companyEmail: string | null;
  members: Listener[];
  salesRep: Listener | null;
}> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      email: true,
      salesRep: {
        select: {
          id: true,
          email: true,
          isActive: true,
          mutedNotifications: true,
        },
      },
      members: {
        where: { isActive: true, role: "COMPANY_ADMIN" },
        select: { id: true, email: true, mutedNotifications: true },
      },
    },
  });
  if (!company) {
    return { name: "", companyEmail: null, members: [], salesRep: null };
  }

  const rep = company.salesRep?.isActive ? company.salesRep : null;

  return {
    name: company.name,
    companyEmail: company.email,
    members: company.members.map((m) => ({
      id: m.id,
      email: m.email,
      muted: m.mutedNotifications,
    })),
    salesRep: rep
      ? { id: rep.id, email: rep.email, muted: rep.mutedNotifications }
      : null,
  };
}

/**
 * Bir olayın kitlesi: susturmayanlar.
 *
 * Susturma **olay bazında**, kanal bazında değil: "sipariş bildirimi istemem"
 * diyen kişi onu e-postayla da telefonla da istemiyor. Kanal seçimi ayrı bir
 * soru ve bugün kurulumun kararı (bkz. `notification-channel.ts`).
 *
 * `extraEmails` bir hesaba ait olmayan adresler (firmanın genel kutusu):
 * susturulamıyorlar, çünkü arkalarında tercih belirtecek bir kullanıcı yok.
 */
function audienceFor(
  event: NotificationEvent,
  listeners: ReadonlyArray<Listener | null>,
  extraEmails: ReadonlyArray<string | null | undefined> = [],
): { emails: string[]; userIds: string[] } {
  const wanted = listeners.filter(
    (l): l is Listener => l !== null && !l.muted.includes(event),
  );
  return {
    emails: recipients(...extraEmails, ...wanted.map((l) => l.email)),
    userIds: [...new Set(wanted.map((l) => l.id))],
  };
}

/**
 * Duyuruyu **açık kanalların hepsine** gönderir, sonra iz bırakır.
 *
 * Eskiden bu iş iki ayrı çağrıydı: `sendMail` ve `sendPush`, her `notifyX`
 * fonksiyonunda elle. Üçüncü bir kanal eklemek o hâlde her çağrı yerine
 * dokunmak demekti; artık kanal kayıt defterinde ve burası yalnızca "şu
 * kitleye şu mesajı" diyor.
 *
 * Tasarım kuralı değişmedi: **hiçbir zaman fırlatmaz.** Bildirim, olmuş bitmiş
 * bir işin duyurusudur; duyuru düşerse iş geri alınmaz.
 */
async function announce(params: {
  event: NotificationEvent;
  audience: { emails: string[]; userIds: string[] };
  message: NotificationMessage;
  entity: string;
  entityId: string;
  summary: string;
}): Promise<void> {
  if (params.audience.emails.length === 0 && params.audience.userIds.length === 0) {
    return;
  }

  const results = await broadcast(params.audience, params.message);
  const attempted = results.filter((r) => !r.skipped);
  // Tek kanal bile geçtiyse duyuru yapılmış sayılıyor: e-postası düşen ama
  // telefonuna düşen bir bildirim, "başarısız" diye kaydedilmemeli.
  const ok = attempted.length === 0 || attempted.some((r) => r.ok);

  await recordAudit({
    // Nobody clicked "send" — the system did, as a consequence of a committed
    // change. The entity/entityId below is what makes the line meaningful.
    actor: { id: null, email: "sistem", role: null },
    action: ok ? "NOTIFICATION_SENT" : "NOTIFICATION_FAILED",
    summary: params.summary,
    entity: params.entity,
    entityId: params.entityId,
    meta: {
      event: params.event,
      to: params.audience.emails,
      userCount: params.audience.userIds.length,
      channels: results.map((r) => ({
        channel: r.channel,
        ok: r.ok,
        transport: r.transport,
        ...(r.skipped ? { skipped: true } : {}),
        ...(r.error ? { error: r.error } : {}),
      })),
    },
  }).catch(() => {
    // The audit trail is best-effort here too: a notification must not be able
    // to fail a request by failing to log that it failed.
  });
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

  const mail = orderPlacedMail({
    orderNumber: order.orderNumber,
    companyName: audience.name,
    grandTotal: order.grandTotal.toFixed(2),
    status: orderStatusLabel(order.status),
    needsApproval,
    link: appUrl(`/orders/${orderId}`),
  });

  // Telefona düşen kısım siparişi **girenden** başkasına gidiyor: kendi
  // yaptığın işi sana bildiren bir uygulama, bir hafta sonra bildirimleri
  // kapattırır. E-posta tarafında siparişi giren listede kalıyor — o bir
  // makbuz, bir uyarı değil.
  //
  // Onay bekleyen bir sipariş firma yöneticisinin işi; canlıya geçmiş bir
  // sipariş plasiyerin haberi.
  const phoneSide = audienceFor(
    "ORDER_PLACED",
    [...audience.members, needsApproval ? null : audience.salesRep],
    [],
  );
  const mailSide = audienceFor(
    "ORDER_PLACED",
    [...audience.members, needsApproval ? null : audience.salesRep],
    [audience.companyEmail, order.createdBy.email],
  );

  await announce({
    event: "ORDER_PLACED",
    audience: {
      emails: mailSide.emails,
      userIds: phoneSide.userIds.filter((id) => id !== order.createdById),
    },
    message: {
      ...mail,
      subject: needsApproval ? "Onay bekleyen sipariş" : "Yeni sipariş",
      short: `${audience.name} · ${order.orderNumber} · ${formatTotal(order.grandTotal)}`,
      route: { screen: "OrderDetail", orderId, orderNumber: order.orderNumber },
    },
    entity: "Order",
    entityId: orderId,
    summary: `Sipariş bildirimi: ${order.orderNumber}`,
  });
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
  const mail = orderStatusMail({
    orderNumber: order.orderNumber,
    status: orderStatusLabel(status),
    note: note ?? null,
    link: appUrl(`/orders/${orderId}`),
  });

  // Durum değişimi siparişi girenin beklediği haber — onaylandı mı, yola çıktı
  // mı. Firma yöneticileri de listede: onay kendilerinde olmasa bile firmanın
  // siparişinin reddedildiğini duymaları gerekiyor.
  const buyer = await prisma.user.findUnique({
    where: { id: order.createdById },
    select: { id: true, email: true, mutedNotifications: true },
  });
  const target = audienceFor(
    "ORDER_STATUS",
    [...audience.members, buyer ? { ...buyer, muted: buyer.mutedNotifications } : null],
    [audience.companyEmail],
  );

  await announce({
    event: "ORDER_STATUS",
    audience: target,
    message: {
      ...mail,
      subject: `Sipariş ${orderStatusLabel(status).toLocaleLowerCase("tr")}`,
      short: `${order.orderNumber}${note ? ` · ${note}` : ""}`,
      route: { screen: "OrderDetail", orderId, orderNumber: order.orderNumber },
    },
    entity: "Order",
    entityId: orderId,
    summary: `Sipariş durum bildirimi: ${order.orderNumber} → ${status}`,
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
  const mail = invoiceIssuedMail({
    documentNumber: invoice.documentNumber,
    orderNumber: invoice.order.orderNumber,
    grandTotal: invoice.grandTotal.toFixed(2),
    dueDate: invoice.dueDate.toLocaleDateString("tr-TR"),
    link: appUrl(`/documents/invoices/${invoiceId}`),
  });

  // Fatura bir ödeme saati başlatıyor; susturulabilir ama varsayılanı açık.
  const target = audienceFor(
    "INVOICE_ISSUED",
    audience.members,
    [audience.companyEmail, invoice.order.createdBy.email],
  );

  await announce({
    event: "INVOICE_ISSUED",
    audience: target,
    message: {
      ...mail,
      short: `${invoice.documentNumber} · ${formatTotal(invoice.grandTotal)}`,
      route: { screen: "OrderDetail", orderId: invoice.orderId, orderNumber: invoice.order.orderNumber },
    },
    entity: "Invoice",
    entityId: invoiceId,
    summary: `Fatura bildirimi: ${invoice.documentNumber}`,
  });
}
