import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createCashAccount, listCashMovements, setMethodBinding } from "../../src/cash";
import { createOrder } from "../../src/order";
import { changeOrderStatus } from "../../src/order-lifecycle";
import {
  cancelPaymentIntent,
  capturePaymentIntent,
  getPaymentIntent,
  listPaymentIntents,
} from "../../src/payment-intent";

// The claim this suite exists to prove: a card order does **not** put money in
// the till when it is confirmed.
//
// Step 27 booked it at confirmation, which recorded money nobody had charged.
// Now the order opens a PaymentIntent and the till hears about it only when the
// charge does — with the built-in manual provider, when a human says the card
// was swiped.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `card${Date.now()}`;

let groupId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let companyId: string;
let buyerId: string;
let adminId: string;
let posId: string;

const ADMIN = () => ({ userId: adminId, role: "SUPER_ADMIN" as const });

async function balanceOf(accountId: string): Promise<number> {
  const row = await prisma.cashAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { currentBalance: true },
  });
  return Number(row.currentBalance);
}

suite("kart tahsilatı (ödeme niyeti) integration", () => {
  beforeAll(async () => {
    // The suite runs against the demo tenant, whose payment block selects the
    // manual provider — the configuration every installation starts on.
    process.env.TENANT_DIR ??= "../../tenants/demo";

    const group = await prisma.customerGroup.create({ data: { name: `Grup ${TAG}` } });
    groupId = group.id;

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` },
    });
    categoryId = category.id;

    const company = await prisma.company.create({
      data: { name: `Firma ${TAG}`, creditLimit: 10_000_000, customerGroupId: groupId },
    });
    companyId = company.id;

    const buyer = await prisma.user.create({
      data: {
        email: `buyer-${TAG}@test.local`,
        name: "Kart Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Kart Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    const product = await prisma.product.create({
      data: {
        name: `Ürün ${TAG}`,
        slug: `urun-${TAG}`,
        vatRate: 0,
        categoryId,
        variants: {
          create: [{ sku: `SKU-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 1_000_000 }],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;

    await prisma.price.create({
      data: { variantId, customerGroupId: groupId, minQuantity: 1, price: 100 },
    });

    posId = await createCashAccount({ name: `POS ${TAG}`, kind: "POS" });
    await setMethodBinding("CREDIT_CARD", posId);
  });

  afterAll(async () => {
    await setMethodBinding("CREDIT_CARD", null);

    const orders = await prisma.order.findMany({
      where: { companyId },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.paymentIntentEvent.deleteMany({ where: { intent: { companyId } } });
    await prisma.paymentIntent.deleteMany({ where: { companyId } });
    await prisma.cashMovement.deleteMany({ where: { accountId: posId } });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.cashAccount.deleteMany({ where: { id: posId } });
    await prisma.$disconnect();
  });

  const placeCard = (qty: number) =>
    createOrder(
      { companyId, paymentMethod: "CREDIT_CARD", items: [{ variantId, quantity: qty }] },
      { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
    );

  describe("sipariş anında", () => {
    it("opens an intent and books no money", async () => {
      const before = await balanceOf(posId);
      const order = await placeCard(3); // 300,00

      expect(order.status).toBe("CONFIRMED");
      expect(order.paymentIntentId).not.toBeNull();

      // The whole point: confirmed order, nothing in the till.
      expect(await balanceOf(posId)).toBeCloseTo(before, 2);

      const intent = await getPaymentIntent(order.paymentIntentId!);
      expect(intent.status).toBe("PENDING");
      expect(intent.amount).toBe("300.00");
      expect(intent.provider).toBe("manual");
      expect(intent.awaitingManualConfirmation).toBe(true);
    });

    it("writes no cari debt either — a card order is not credit", async () => {
      const debts = await prisma.transaction.count({
        where: { companyId, type: "DEBIT", paymentMethod: "CREDIT_CARD" },
      });
      expect(debts).toBe(0);
    });
  });

  describe("tahsilat onayı", () => {
    it("puts the money into the bound account, once", async () => {
      const before = await balanceOf(posId);
      const order = await placeCard(2); // 200,00

      const captured = await capturePaymentIntent(order.paymentIntentId!, adminId);
      expect(captured.status).toBe("CAPTURED");
      expect(await balanceOf(posId)).toBeCloseTo(before + 200, 2);

      const [entry] = await listCashMovements({ accountId: posId, limit: 1 });
      expect(entry?.direction).toBe("IN");
      expect(entry?.orderNumber).toBe(order.orderNumber);

      // A double-clicked onayla button must not book the amount twice.
      await expect(
        capturePaymentIntent(order.paymentIntentId!, adminId),
      ).rejects.toThrow(/zaten alınmış/);
      expect(await balanceOf(posId)).toBeCloseTo(before + 200, 2);
    });

    it("keeps the whole history, not just the final state", async () => {
      const order = await placeCard(1);
      await capturePaymentIntent(order.paymentIntentId!, adminId);

      const intent = await getPaymentIntent(order.paymentIntentId!);
      // A disputed payment is the most argued-about record there is, so every
      // transition it made survives.
      expect(intent.events.map((e) => e.status)).toEqual(["PENDING", "CAPTURED"]);
      expect(intent.events[1]!.actorName).toBe("Kart Admin");
    });
  });

  describe("vazgeçmek", () => {
    it("cancels an untaken charge without touching the till", async () => {
      const before = await balanceOf(posId);
      const order = await placeCard(4);

      await cancelPaymentIntent(order.paymentIntentId!, "müşteri vazgeçti", adminId);

      const intent = await getPaymentIntent(order.paymentIntentId!);
      expect(intent.status).toBe("CANCELLED");
      expect(await balanceOf(posId)).toBeCloseTo(before, 2);
    });

    it("refuses to cancel money that was actually taken", async () => {
      const order = await placeCard(1);
      await capturePaymentIntent(order.paymentIntentId!, adminId);

      // Marking it cancelled would lose the fact that it has to go back.
      await expect(
        cancelPaymentIntent(order.paymentIntentId!, "olmaz", adminId),
      ).rejects.toThrow(/iade edin/);
    });

    it("refuses to charge a cancelled order", async () => {
      const order = await placeCard(1);
      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());

      await expect(
        capturePaymentIntent(order.paymentIntentId!, adminId),
      ).rejects.toThrow();
    });
  });

  describe("sipariş iptali", () => {
    it("abandons an open charge", async () => {
      const order = await placeCard(2);
      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());

      const intent = await getPaymentIntent(order.paymentIntentId!);
      expect(intent.status).toBe("CANCELLED");
    });

    it("marks a taken one refunded and reverses the till entry", async () => {
      const before = await balanceOf(posId);
      const order = await placeCard(5); // 500,00
      await capturePaymentIntent(order.paymentIntentId!, adminId);
      expect(await balanceOf(posId)).toBeCloseTo(before + 500, 2);

      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());

      // The money goes back out of the account it landed in…
      expect(await balanceOf(posId)).toBeCloseTo(before, 2);
      // …and the intent says refunded, not cancelled: money did move, and that
      // fact must survive the order's cancellation.
      const intent = await getPaymentIntent(order.paymentIntentId!);
      expect(intent.status).toBe("REFUNDED");
    });
  });

  describe("listeleme", () => {
    it("filters by status for the bekleyen list the kasa screen opens on", async () => {
      const pending = await listPaymentIntents({ companyId, status: "PENDING" });
      expect(pending.every((i) => i.status === "PENDING")).toBe(true);
      expect(pending.every((i) => i.awaitingManualConfirmation)).toBe(true);
    });
  });
});
