import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import { createInvoice } from "../../src/invoice";
import { createShipment, getOpenLines } from "../../src/shipment";
import {
  completePasswordReset,
  purgePasswordResetTokens,
  requestPasswordReset,
} from "../../src/password-reset";
import {
  notifyInvoiceIssued,
  notifyOrderPlaced,
  notifyOrderStatusChanged,
} from "../../src/notification";
import { mailTransportKind } from "../../src/mail";
import { useOwnDefaultSeries, type SeriesFixture } from "./series-fixture";

// Password reset and outbound notifications against a real database.
//
// The console transport is what makes this testable without a mail server: it
// prints the message, so the reset link can be read back out of the log exactly
// the way a user reads it out of their inbox.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `am${Date.now()}`;
const ADMIN = { userId: "", role: "SUPER_ADMIN" as const };
const PASSWORD = "Password123!";

let companyId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let ownerId: string;
let buyerId: string;
let adminId: string;
let series: SeriesFixture;

let mailLog: string[] = [];
let warnSpy: ReturnType<typeof vi.spyOn>;

/** Everything the console transport printed since the last reset. */
function lastMail(): string {
  return mailLog[mailLog.length - 1] ?? "";
}

suite("password reset + notifications", () => {
  beforeAll(async () => {
    // Deterministic transport: never send real mail from a test run.
    delete process.env.SMTP_HOST;
    process.env.APP_URL = "http://localhost:3000";

    const company = await prisma.company.create({
      data: {
        name: `AM Firma ${TAG}`,
        email: `am-firma-${TAG}@test.local`,
        creditLimit: 10_000_000,
        paymentTermDays: 30,
      },
    });
    companyId = company.id;

    const owner = await prisma.user.create({
      data: {
        email: `am-owner-${TAG}@test.local`,
        name: "AM Yönetici",
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    ownerId = owner.id;

    const buyer = await prisma.user.create({
      data: {
        email: `am-buyer-${TAG}@test.local`,
        name: "AM Alıcı",
        passwordHash: "x",
        role: "COMPANY_STAFF",
        companyId,
      },
    });
    buyerId = buyer.id;

    const admin = await prisma.user.create({
      data: {
        email: `am-admin-${TAG}@test.local`,
        name: "AM Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;
    ADMIN.userId = admin.id;

    const category = await prisma.category.create({
      data: { name: `AM Kategori ${TAG}`, slug: `am-kat-${TAG}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: `AM Ürün ${TAG}`,
        slug: `am-urun-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: { create: [{ sku: `AMA-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 1000 }] },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;
    await prisma.price.create({ data: { variantId, minQuantity: 1, price: 10 } });

    series = await useOwnDefaultSeries(TAG);
  });

  beforeEach(() => {
    mailLog = [];
    warnSpy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      mailLog.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(async () => {
    if (!hasDb) return;
    const orders = await prisma.order.findMany({ where: { companyId }, select: { id: true } });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await series.restore();
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [ownerId, buyerId, adminId] } } });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  /**
   * Clear a user's tickets so the next test starts with an empty throttle
   * window. Without this the 3-per-15-minutes limit is shared across the whole
   * file and later tests silently get no mail at all.
   */
  async function freshWindow(userId: string): Promise<void> {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
  }

  /** Ask for a link and dig the token back out of the printed mail. */
  async function requestAndReadToken(email: string): Promise<string> {
    await requestPasswordReset(email, { ip: "127.0.0.1" });
    const match = lastMail().match(/yenile\?token=([a-f0-9]{64})/);
    if (!match) throw new Error("Sıfırlama e-postası gönderilmedi");
    return match[1]!;
  }

  describe("şifremi unuttum", () => {
    it("uses the console transport when SMTP_HOST is unset", () => {
      expect(mailTransportKind()).toBe("console");
    });

    it("says nothing and stores nothing for an unknown address", async () => {
      await expect(
        requestPasswordReset(`yok-${TAG}@test.local`, {}),
      ).resolves.toBeUndefined();
      expect(mailLog).toHaveLength(0);
    });

    it("stores only the hash of the token, never the token itself", async () => {
      await freshWindow(ownerId);
      const token = await requestAndReadToken(`am-owner-${TAG}@test.local`);
      expect(token).toMatch(/^[a-f0-9]{64}$/);

      const rows = await prisma.passwordResetToken.findMany({ where: { userId: ownerId } });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.tokenHash !== token)).toBe(true);
    });

    it("invalidates the previous link when a new one is asked for", async () => {
      await freshWindow(ownerId);
      const first = await requestAndReadToken(`am-owner-${TAG}@test.local`);
      const second = await requestAndReadToken(`am-owner-${TAG}@test.local`);
      expect(first).not.toBe(second);

      await expect(
        completePasswordReset({ token: first, password: "Yeni12345" }),
      ).rejects.toMatchObject({ code: "RESET_TOKEN_INVALID" });
    });

    it("stops sending after three requests in the window, without changing its answer", async () => {
      await freshWindow(buyerId);
      const email = `am-buyer-${TAG}@test.local`;
      for (let i = 0; i < 3; i += 1) await requestPasswordReset(email, {});
      const sent = mailLog.length;

      await expect(requestPasswordReset(email, {})).resolves.toBeUndefined();
      expect(mailLog).toHaveLength(sent); // throttled: no fourth mail
      expect(await prisma.passwordResetToken.count({ where: { userId: buyerId } })).toBe(3);
    });

    it("refuses a forged and an expired token alike", async () => {
      await expect(
        completePasswordReset({ token: "f".repeat(64), password: "Yeni12345" }),
      ).rejects.toMatchObject({ code: "RESET_TOKEN_INVALID" });

      await freshWindow(ownerId);
      const token = await requestAndReadToken(`am-owner-${TAG}@test.local`);
      await prisma.passwordResetToken.updateMany({
        where: { userId: ownerId, usedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(
        completePasswordReset({ token, password: "Yeni12345" }),
      ).rejects.toMatchObject({ code: "RESET_TOKEN_INVALID" });
    });

    it("changes the password, revokes sessions and clears the lockout", async () => {
      await freshWindow(ownerId);
      await prisma.user.update({
        where: { id: ownerId },
        data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 600_000) },
      });
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: ownerId },
        select: { tokenVersion: true },
      });

      const token = await requestAndReadToken(`am-owner-${TAG}@test.local`);
      await completePasswordReset({ token, password: "Yeni12345" });

      const after = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
      expect(await bcrypt.compare("Yeni12345", after.passwordHash)).toBe(true);
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);
      expect(after.lockedUntil).toBeNull();
      expect(after.failedLoginCount).toBe(0);

      // Single use.
      await expect(
        completePasswordReset({ token, password: "Baska12345" }),
      ).rejects.toMatchObject({ code: "RESET_TOKEN_INVALID" });
    });

    it("purges spent and expired tickets, leaving live ones alone", async () => {
      await freshWindow(ownerId);
      const cutoff = new Date();
      await prisma.passwordResetToken.createMany({
        data: [
          {
            userId: ownerId,
            tokenHash: `expired-${TAG}`,
            expiresAt: new Date(cutoff.getTime() - 60_000),
          },
          {
            userId: ownerId,
            tokenHash: `spent-${TAG}`,
            expiresAt: new Date(cutoff.getTime() + 3_600_000),
            usedAt: new Date(cutoff.getTime() - 60_000),
          },
          {
            userId: ownerId,
            tokenHash: `live-${TAG}`,
            expiresAt: new Date(cutoff.getTime() + 3_600_000),
          },
        ],
      });

      // The purge is system-wide, so the count also sweeps up whatever the
      // earlier tests left behind — only the floor is ours to assert.
      expect(await purgePasswordResetTokens(cutoff)).toBeGreaterThanOrEqual(2);
      const left = await prisma.passwordResetToken.findMany({
        where: { userId: ownerId },
        select: { tokenHash: true },
      });
      expect(left.map((t) => t.tokenHash)).toEqual([`live-${TAG}`]);
    });
  });

  describe("bildirimler", () => {
    async function freshOrder() {
      return createOrder(
        { companyId, paymentMethod: "OPEN_ACCOUNT", items: [{ variantId, quantity: 10 }] },
        { createdById: buyerId, createdByRole: "COMPANY_STAFF" },
      );
    }

    it("tells the company admin and the buyer about a new order", async () => {
      const order = await freshOrder();
      await notifyOrderPlaced(order.orderId);

      const mail = lastMail();
      expect(mail).toContain(order.orderNumber);
      expect(mail).toContain(`am-owner-${TAG}@test.local`);
      expect(mail).toContain(`am-buyer-${TAG}@test.local`);

      const entry = await prisma.auditLog.findFirst({
        where: { entity: "Order", entityId: order.orderId, action: "NOTIFICATION_SENT" },
      });
      expect(entry).not.toBeNull();
    });

    it("stays quiet for intermediate statuses and speaks for the ones that matter", async () => {
      const order = await freshOrder();

      await notifyOrderStatusChanged(order.orderId, "PROCESSING");
      expect(mailLog).toHaveLength(0);

      await notifyOrderStatusChanged(order.orderId, "SHIPPED", "Kargoya verildi");
      expect(lastMail()).toContain("Sevk edildi");
      expect(lastMail()).toContain("Kargoya verildi");
    });

    it("announces an invoice with its number and due date", async () => {
      const order = await freshOrder();
      const lines = await getOpenLines(order.orderId);
      await createShipment(
        order.orderId,
        { items: [{ orderItemId: lines[0]!.orderItemId, quantity: 10 }] },
        ADMIN,
      );
      const invoice = await createInvoice(order.orderId, {}, ADMIN);

      await notifyInvoiceIssued(invoice.invoiceId);
      const mail = lastMail();
      expect(mail).toContain(invoice.documentNumber);
      expect(mail).toContain(order.orderNumber);
      expect(mail).toContain(`/documents/invoices/${invoice.invoiceId}`);
    });

    it("never throws when the order it is asked to announce is gone", async () => {
      await expect(notifyOrderPlaced("clzzzzzzzzzzzzzzzzzzzzzzz")).resolves.toBeUndefined();
      await expect(notifyInvoiceIssued("clzzzzzzzzzzzzzzzzzzzzzzz")).resolves.toBeUndefined();
    });
  });
});
