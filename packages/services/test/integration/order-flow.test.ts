import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import { quoteOrder } from "../../src/order-quote";
import { changeOrderStatus, getOrderDetail } from "../../src/order-lifecycle";
import { approveOrder } from "../../src/order-approval";

// Integration suite: real Prisma against a real Postgres. Every row it touches
// belongs to a fixture it created itself, so it can run against a database that
// already has seed data (or a previous run's leftovers) without reading or
// disturbing any of it. Skipped when there is no DATABASE_URL, so `pnpm test` on
// a machine with no database still passes the unit suite.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `it${Date.now()}`;
const ADMIN_CTX = { userId: "", role: "SUPER_ADMIN" as const, companyId: null };

let groupId: string;
let categoryId: string;
let companyId: string;
let approvalCompanyId: string;
let buyerId: string;
let staffId: string;
let adminId: string;
let variantId: string;
let productId: string;
let autoPromotionId: string;
let couponPromotionId: string;
let couponCode: string;

suite("order + promotion integration", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({ data: { name: `Grup ${TAG}` } });
    groupId = group.id;

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` },
    });
    categoryId = category.id;

    const company = await prisma.company.create({
      data: { name: `Firma ${TAG}`, creditLimit: 1_000_000, customerGroupId: groupId },
    });
    companyId = company.id;

    const approvalCompany = await prisma.company.create({
      data: {
        name: `Onayli Firma ${TAG}`,
        creditLimit: 1_000_000,
        customerGroupId: groupId,
        requiresOrderApproval: true,
      },
    });
    approvalCompanyId = approvalCompany.id;

    const buyer = await prisma.user.create({
      data: {
        email: `buyer-${TAG}@test.local`,
        name: "Test Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;

    const staff = await prisma.user.create({
      data: {
        email: `staff-${TAG}@test.local`,
        name: "Test Personel",
        passwordHash: "x",
        role: "COMPANY_STAFF",
        companyId: approvalCompanyId,
      },
    });
    staffId = staff.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Test Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;
    ADMIN_CTX.userId = admin.id;

    const product = await prisma.product.create({
      data: {
        name: `Ürün ${TAG}`,
        slug: `urun-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: {
          create: [
            { sku: `SKU-${TAG}`, unitsPerCase: 10, moqUnits: 10, stock: 100_000 },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;

    await prisma.price.createMany({
      data: [
        { variantId, minQuantity: 1, price: 12.5 },
        { variantId, customerGroupId: groupId, minQuantity: 1, price: 10 },
        { variantId, customerGroupId: groupId, minQuantity: 500, price: 9 },
      ],
    });

    const auto = await prisma.promotion.create({
      data: {
        name: `Oto %5 ${TAG}`,
        priority: 10,
        conditions: [
          { type: "MIN_ORDER_SUBTOTAL", params: { amount: 10000 } },
          { type: "CUSTOMER_GROUP_IN", params: { customerGroupIds: [groupId] } },
        ],
        actions: [{ type: "PERCENT_OFF", params: { percent: 5 } }],
      },
    });
    autoPromotionId = auto.id;

    couponCode = `KUPON${TAG}`.toUpperCase().slice(0, 20);
    const coupon = await prisma.promotion.create({
      data: {
        name: `Kupon ${TAG}`,
        code: couponCode,
        priority: 20,
        perCompanyLimit: 1,
        conditions: [{ type: "FIRST_ORDER", params: {} }],
        actions: [{ type: "FIXED_OFF_ORDER", params: { amount: 250 } }],
      },
    });
    couponPromotionId = coupon.id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const companies = [companyId, approvalCompanyId].filter(Boolean);
    const orders = await prisma.order.findMany({
      where: { companyId: { in: companies } },
      select: { id: true },
    });
    await prisma.transaction.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.promotion.deleteMany({
      where: { id: { in: [autoPromotionId, couponPromotionId] } },
    });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, staffId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  const cart = (quantity: number) => [{ variantId, quantity }];
  const base = () => ({ companyId, paymentMethod: "OPEN_ACCOUNT" as const });

  describe("quote", () => {
    it("prices from the company's group tier", async () => {
      const q = await quoteOrder({ ...base(), items: cart(100) });
      expect(q.lines[0]!.unitPrice).toBe("10.00"); // group price, not the 12,50 list
      expect(q.subtotal).toBe("1000.00");
      expect(q.promotionTotal).toBe("0.00"); // below the 10.000 threshold
      expect(q.grandTotal).toBe("1200.00");
    });

    it("moves to the quantity tier at its threshold", async () => {
      const q = await quoteOrder({ ...base(), items: cart(500) });
      expect(q.lines[0]!.unitPrice).toBe("9.00");
    });

    it("applies the automatic campaign and taxes the net after it", async () => {
      const q = await quoteOrder({ ...base(), items: cart(2000) });
      expect(q.subtotal).toBe("18000.00");
      expect(q.promotionTotal).toBe("900.00");
      expect(q.taxTotal).toBe("3420.00"); // (18000 − 900) × 20 %
      expect(q.grandTotal).toBe("20520.00");
    });

    it("stacks a coupon on top, matched case-insensitively", async () => {
      const q = await quoteOrder({
        ...base(),
        couponCode: couponCode.toLowerCase(),
        items: cart(2000),
      });
      expect(q.promotions).toHaveLength(2);
      expect(q.promotionTotal).toBe("1150.00"); // 900 + 250
      expect(q.taxTotal).toBe("3370.00"); // (18000 − 1150) × 20 %
      expect(q.grandTotal).toBe("20220.00");
    });

    it("rejects a coupon that does not exist", async () => {
      await expect(
        quoteOrder({ ...base(), couponCode: "YOKBOYLE", items: cart(100) }),
      ).rejects.toMatchObject({ code: "COUPON_INVALID" });
    });

    it("enforces MOQ, case multiples and stock", async () => {
      await expect(quoteOrder({ ...base(), items: cart(5) })).rejects.toMatchObject({
        code: "MOQ_NOT_MET",
      });
      await expect(quoteOrder({ ...base(), items: cart(15) })).rejects.toMatchObject({
        code: "NOT_CASE_MULTIPLE",
      });
      await expect(
        quoteOrder({ ...base(), items: cart(1_000_000) }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    });
  });

  describe("order creation", () => {
    it("freezes the quote, reserves stock and debits the account", async () => {
      const before = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stock: true },
      });

      const quote = await quoteOrder({ ...base(), couponCode, items: cart(2000) });
      const order = await createOrder(
        { ...base(), couponCode, items: cart(2000) },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );

      expect(order.status).toBe("CONFIRMED");
      expect(order.grandTotal).toBe(quote.grandTotal);
      expect(order.promotionTotal).toBe(quote.promotionTotal);

      const detail = await getOrderDetail(order.orderId, ADMIN_CTX);
      expect(detail.promotions).toHaveLength(2);
      expect(detail.couponCode).toBe(couponCode);
      expect(detail.items[0]!.promotionDiscount).toBe("1150.00");
      expect(detail.items[0]!.lineTotal).toBe("16850.00"); // 18000 − 1150

      const after = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stock: true },
      });
      expect(after.stock).toBe(before.stock - 2000);

      const debit = await prisma.transaction.findFirstOrThrow({
        where: { orderId: order.orderId, type: "DEBIT" },
      });
      expect(debit.amount.toFixed(2)).toBe(order.grandTotal);

      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { currentBalance: true },
      });
      expect(company.currentBalance.toFixed(2)).toBe(order.grandTotal);
    });

    it("spends the coupon's per-company quota", async () => {
      await expect(
        quoteOrder({ ...base(), couponCode, items: cart(2000) }),
      ).rejects.toMatchObject({ code: "COUPON_INVALID" });
    });

    it("sends a staff order of an approval-required company to PENDING_APPROVAL", async () => {
      const order = await createOrder(
        {
          companyId: approvalCompanyId,
          paymentMethod: "OPEN_ACCOUNT",
          items: cart(100),
        },
        { createdById: staffId, createdByRole: "COMPANY_STAFF" },
      );
      expect(order.status).toBe("PENDING_APPROVAL");
      expect(order.reason).toBe("APPROVAL_REQUIRED");

      // Nothing is owed until someone approves it.
      const debits = await prisma.transaction.count({
        where: { orderId: order.orderId, type: "DEBIT" },
      });
      expect(debits).toBe(0);

      const approved = await approveOrder(order.orderId, {
        approverId: adminId,
        approverRole: "SUPER_ADMIN",
        approverCompanyId: null,
      });
      expect(approved.status).toBe("CONFIRMED");
      expect(
        await prisma.transaction.count({
          where: { orderId: order.orderId, type: "DEBIT" },
        }),
      ).toBe(1);
    });

    it("holds an order that would breach the credit limit", async () => {
      const tight = await prisma.company.create({
        data: { name: `Limitli ${TAG}`, creditLimit: 100, customerGroupId: groupId },
      });
      const order = await createOrder(
        { companyId: tight.id, paymentMethod: "OPEN_ACCOUNT", items: cart(100) },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );
      expect(order.status).toBe("PENDING_CREDIT");
      expect(order.reason).toBe("CREDIT_EXCEEDED");

      await prisma.transaction.deleteMany({ where: { companyId: tight.id } });
      await prisma.order.deleteMany({ where: { companyId: tight.id } });
      await prisma.company.delete({ where: { id: tight.id } });
    });
  });

  describe("cancellation", () => {
    it("restocks, reverses the debit and frees the campaign quota", async () => {
      const order = await createOrder(
        { ...base(), items: cart(2000) },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );
      const stockAfterOrder = (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantId },
          select: { stock: true },
        })
      ).stock;
      const balanceAfterOrder = (
        await prisma.company.findUniqueOrThrow({
          where: { id: companyId },
          select: { currentBalance: true },
        })
      ).currentBalance;

      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN_CTX);

      const stock = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stock: true },
      });
      expect(stock.stock).toBe(stockAfterOrder + 2000);

      const balance = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { currentBalance: true },
      });
      expect(balance.currentBalance.toFixed(2)).toBe(
        balanceAfterOrder.sub(order.grandTotal).toFixed(2),
      );

      // The record of what the campaign gave survives the cancellation…
      const detail = await getOrderDetail(order.orderId, ADMIN_CTX);
      expect(detail.promotions.length).toBeGreaterThan(0);
      // …but the quota it consumed is back.
      const requote = await quoteOrder({ ...base(), items: cart(2000) });
      expect(requote.promotionTotal).toBe("900.00");
    });

    it("refuses a transition the state machine does not allow", async () => {
      const order = await createOrder(
        { ...base(), items: cart(100) },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );
      await expect(
        changeOrderStatus(order.orderId, { status: "DELIVERED" }, ADMIN_CTX),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });
    });

    it("does not let a buyer set a fulfilment status", async () => {
      const order = await createOrder(
        { ...base(), items: cart(100) },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );
      await expect(
        changeOrderStatus(
          order.orderId,
          { status: "SHIPPED" },
          { userId: buyerId, role: "COMPANY_ADMIN", companyId },
        ),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
  });

  describe("disabled campaign", () => {
    it("stops applying the moment it is switched off", async () => {
      await prisma.promotion.update({
        where: { id: autoPromotionId },
        data: { enabled: false },
      });
      const q = await quoteOrder({ ...base(), items: cart(2000) });
      expect(q.promotionTotal).toBe("0.00");

      await prisma.promotion.update({
        where: { id: autoPromotionId },
        data: { enabled: true },
      });
    });

    it("ignores a campaign whose window has closed", async () => {
      await prisma.promotion.update({
        where: { id: autoPromotionId },
        data: { endsAt: new Date("2020-01-01") },
      });
      const q = await quoteOrder({ ...base(), items: cart(2000) });
      expect(q.promotionTotal).toBe("0.00");

      await prisma.promotion.update({
        where: { id: autoPromotionId },
        data: { endsAt: null },
      });
    });
  });
});
