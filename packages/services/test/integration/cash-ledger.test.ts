import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  createCashAccount,
  getCashSummary,
  listCashMovements,
  recordManualMovement,
  reverseCashMovement,
  setMethodBinding,
  transferBetweenAccounts,
} from "../../src/cash";
import { createOrder } from "../../src/order";
import { changeOrderStatus } from "../../src/order-lifecycle";
import { recordPayment, reversePayment } from "../../src/payment";

// The till against a real database.
//
// The claim this suite has to prove is the one that motivated the whole step:
// a peşin order used to write nothing anywhere, so "bugün kasaya ne girdi" had
// no answer. Everything else here follows from that — the money must land in
// the right account, come back out when the order dies, and a cheque must not
// pretend to be cash.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `cash${Date.now()}`;

let groupId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let companyId: string;
let buyerId: string;
let adminId: string;
let tillId: string;
let bankId: string;

const ADMIN = () => ({ userId: adminId, role: "SUPER_ADMIN" as const });

/** Balance straight from the row, so the cached column is what gets asserted. */
async function balanceOf(accountId: string): Promise<number> {
  const row = await prisma.cashAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { currentBalance: true },
  });
  return Number(row.currentBalance);
}

suite("kasa & banka defteri integration", () => {
  beforeAll(async () => {
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
        name: "Kasa Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Kasa Admin",
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

    // This suite's own accounts, bound to the methods it uses. The binding is
    // global, so it is pointed back at whatever it was in afterAll.
    tillId = await createCashAccount({ name: `Kasa ${TAG}`, kind: "CASH" });
    bankId = await createCashAccount({ name: `Banka ${TAG}`, kind: "BANK" });
    await setMethodBinding("CASH", tillId);
    await setMethodBinding("BANK_TRANSFER", bankId);
  });

  afterAll(async () => {
    await setMethodBinding("CASH", null);
    await setMethodBinding("BANK_TRANSFER", null);

    const orders = await prisma.order.findMany({
      where: { companyId },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.cashMovement.deleteMany({
      where: { accountId: { in: [tillId, bankId] } },
    });
    // Çek/senet tahsilatı portföye bir kâğıt açıyor ve o kâğıt tahsilat
    // satırına bağlı; önce kâğıt düşmeden cari hareketleri silinemez.
    await prisma.chequeEvent.deleteMany({ where: { cheque: { companyId } } });
    await prisma.cheque.deleteMany({ where: { companyId } });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.cashAccount.deleteMany({ where: { id: { in: [tillId, bankId] } } });
    await prisma.$disconnect();
  });

  const items = (quantity: number) => [{ variantId, quantity }];
  const place = (paymentMethod: "CASH" | "BANK_TRANSFER" | "OPEN_ACCOUNT", qty: number) =>
    createOrder(
      { companyId, paymentMethod, items: items(qty) },
      { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
    );

  describe("peşin sipariş", () => {
    it("books a nakit order into the till the method is bound to", async () => {
      const before = await balanceOf(tillId);
      const order = await place("CASH", 3); // 300,00 — VAT is 0 on this product
      expect(order.status).toBe("CONFIRMED");

      expect(await balanceOf(tillId)).toBeCloseTo(before + 300, 2);

      const [entry] = await listCashMovements({ accountId: tillId, limit: 5 });
      expect(entry?.direction).toBe("IN");
      expect(entry?.source).toBe("ORDER");
      expect(entry?.orderNumber).toBe(order.orderNumber);
    });

    it("leaves the cari untouched for that order", async () => {
      // The point of the whole module: this order books no debt, so before it
      // there was no record of the money anywhere at all.
      const debts = await prisma.transaction.count({
        where: { companyId, type: "DEBIT", paymentMethod: "CASH" },
      });
      expect(debts).toBe(0);
    });

    it("sends a havale order to its own account, not the till", async () => {
      const tillBefore = await balanceOf(tillId);
      const bankBefore = await balanceOf(bankId);

      await place("BANK_TRANSFER", 2); // 200,00

      expect(await balanceOf(bankId)).toBeCloseTo(bankBefore + 200, 2);
      expect(await balanceOf(tillId)).toBeCloseTo(tillBefore, 2);
    });

    it("writes nothing for an açık hesap order", async () => {
      const tillBefore = await balanceOf(tillId);
      const bankBefore = await balanceOf(bankId);

      const order = await place("OPEN_ACCOUNT", 5);

      expect(await balanceOf(tillId)).toBeCloseTo(tillBefore, 2);
      expect(await balanceOf(bankId)).toBeCloseTo(bankBefore, 2);
      // …but it does book a receivable, which is the other ledger's job.
      const debit = await prisma.transaction.findFirst({
        where: { orderId: order.orderId, type: "DEBIT" },
      });
      expect(debit).not.toBeNull();
    });

    it("takes the money back out when the order is cancelled", async () => {
      const before = await balanceOf(tillId);
      const order = await place("CASH", 4); // +400,00
      expect(await balanceOf(tillId)).toBeCloseTo(before + 400, 2);

      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());

      expect(await balanceOf(tillId)).toBeCloseTo(before, 2);

      // Undone by an opposing entry, not by deleting the original: both stay
      // on the ledger, which is what an auditor reconciling the day needs.
      const entries = await prisma.cashMovement.findMany({
        where: { orderId: order.orderId },
        orderBy: { createdAt: "asc" },
      });
      expect(entries).toHaveLength(2);
      expect(entries[1]!.direction).toBe("OUT");
      expect(entries[1]!.reversalOfId).toBe(entries[0]!.id);
    });
  });

  describe("tahsilat", () => {
    it("puts a nakit collection into the chosen account", async () => {
      const before = await balanceOf(bankId);
      const result = await recordPayment(
        { companyId, amount: 250, collectionMethod: "CASH", cashAccountId: bankId },
        adminId,
      );

      expect(result.cashMovementId).not.toBeNull();
      expect(await balanceOf(bankId)).toBeCloseTo(before + 250, 2);
    });

    it("settles the cari for a çek without touching any till", async () => {
      const tillBefore = await balanceOf(tillId);
      const bankBefore = await balanceOf(bankId);
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { currentBalance: true },
      });

      const result = await recordPayment(
        { companyId, amount: 500, collectionMethod: "CHEQUE" },
        adminId,
      );

      expect(result.cashMovementId).toBeNull();
      expect(await balanceOf(tillId)).toBeCloseTo(tillBefore, 2);
      expect(await balanceOf(bankId)).toBeCloseTo(bankBefore, 2);
      // The debt did move, though — that is what accepting a cheque does.
      expect(Number(result.newBalance)).toBeCloseTo(
        Number(company.currentBalance) - 500,
        2,
      );
    });

    it("reverses the till entry when the collection is reversed", async () => {
      const before = await balanceOf(tillId);
      const collection = await recordPayment(
        { companyId, amount: 120, collectionMethod: "CASH", cashAccountId: tillId },
        adminId,
      );
      expect(await balanceOf(tillId)).toBeCloseTo(before + 120, 2);

      await reversePayment(
        { transactionId: collection.transactionId, companyId, reason: "yanlış tutar" },
        adminId,
      );

      expect(await balanceOf(tillId)).toBeCloseTo(before, 2);
    });

    it("takes nothing out when a çek collection is reversed", async () => {
      const before = await balanceOf(tillId);
      const collection = await recordPayment(
        { companyId, amount: 700, collectionMethod: "CHEQUE" },
        adminId,
      );
      await reversePayment(
        { transactionId: collection.transactionId, companyId, reason: "çek iade" },
        adminId,
      );

      // A reversal that guessed from the method rather than reading the entries
      // would have invented an OUT here and emptied the till by 700.
      expect(await balanceOf(tillId)).toBeCloseTo(before, 2);
    });
  });

  describe("elle giriş ve aktarım", () => {
    it("records an expense and undoes it with its opposite", async () => {
      const before = await balanceOf(tillId);
      const entry = await recordManualMovement(
        { accountId: tillId, direction: "OUT", amount: 80, description: "Yakıt" },
        adminId,
      );
      expect(await balanceOf(tillId)).toBeCloseTo(before - 80, 2);

      await reverseCashMovement({ movementId: entry.id, reason: "yanlış hesap" }, adminId);
      expect(await balanceOf(tillId)).toBeCloseTo(before, 2);
    });

    it("refuses to reverse an order entry by hand", async () => {
      const order = await place("CASH", 1);
      const [entry] = await listCashMovements({ accountId: tillId, source: "ORDER" });
      expect(entry?.orderNumber).toBe(order.orderNumber);

      // Its other half is an order status. Undoing this side alone would leave
      // a confirmed order whose money had walked out of the safe.
      await expect(
        reverseCashMovement({ movementId: entry!.id, reason: "olmaz" }, adminId),
      ).rejects.toThrow(/iptal edilemez/);
    });

    it("moves money between accounts as two linked entries", async () => {
      const tillBefore = await balanceOf(tillId);
      const bankBefore = await balanceOf(bankId);

      const transfer = await transferBetweenAccounts(
        { fromAccountId: tillId, toAccountId: bankId, amount: 150 },
        adminId,
      );

      expect(await balanceOf(tillId)).toBeCloseTo(tillBefore - 150, 2);
      expect(await balanceOf(bankId)).toBeCloseTo(bankBefore + 150, 2);

      // Undoing one leg has to undo the other, or the transfer would create
      // money on the receiving side.
      await reverseCashMovement(
        { movementId: transfer.outMovementId, reason: "yanlış hesap" },
        adminId,
      );
      expect(await balanceOf(tillId)).toBeCloseTo(tillBefore, 2);
      expect(await balanceOf(bankId)).toBeCloseTo(bankBefore, 2);
    });
  });

  describe("gün sonu", () => {
    it("sums today's movements by source and by account", async () => {
      const summary = await getCashSummary({});

      expect(Number(summary.totalIn)).toBeGreaterThan(0);
      expect(summary.bySource.some((s) => s.source === "ORDER")).toBe(true);

      const till = summary.byAccount.find((a) => a.accountId === tillId);
      expect(till).toBeDefined();
      expect(Number(till!.currentBalance)).toBeCloseTo(await balanceOf(tillId), 2);
    });
  });
});
