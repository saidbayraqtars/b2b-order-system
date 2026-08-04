import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import { changeOrderStatus, getOrderDetail } from "../../src/order-lifecycle";
import { cancelShipment, createShipment, getOpenLines, listShipments } from "../../src/shipment";
import { cancelInvoice, createInvoice, listInvoices } from "../../src/invoice";
import { getCompanyAging } from "../../src/ledger";

// Partial despatch and partial invoicing, which is where the arithmetic gets
// interesting: an order split across documents must still add up to the order.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `ff${Date.now()}`;
const ADMIN = { userId: "", role: "SUPER_ADMIN" as const };

let groupId: string;
let categoryId: string;
let companyId: string;
let buyerId: string;
let adminId: string;
let productId: string;
let variantA: string;
let variantB: string;
let promotionId: string;
let waybillSeriesId: string;
let invoiceSeriesId: string;

suite("shipment + invoice integration", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({ data: { name: `FF Grup ${TAG}` } });
    groupId = group.id;
    const category = await prisma.category.create({
      data: { name: `FF Kategori ${TAG}`, slug: `ff-kat-${TAG}` },
    });
    categoryId = category.id;
    const company = await prisma.company.create({
      data: {
        name: `FF Firma ${TAG}`,
        creditLimit: 10_000_000,
        customerGroupId: groupId,
        paymentTermDays: 30,
      },
    });
    companyId = company.id;
    const buyer = await prisma.user.create({
      data: {
        email: `ff-buyer-${TAG}@test.local`,
        name: "FF Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;
    const admin = await prisma.user.create({
      data: {
        email: `ff-admin-${TAG}@test.local`,
        name: "FF Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;
    ADMIN.userId = admin.id;

    const product = await prisma.product.create({
      data: {
        name: `FF Ürün ${TAG}`,
        slug: `ff-urun-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: {
          create: [
            { sku: `FFA-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 10_000 },
            { sku: `FFB-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 10_000 },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantA = product.variants.find((v) => v.sku.startsWith("FFA"))!.id;
    variantB = product.variants.find((v) => v.sku.startsWith("FFB"))!.id;

    await prisma.price.createMany({
      data: [
        { variantId: variantA, minQuantity: 1, price: 10 },
        { variantId: variantB, minQuantity: 1, price: 20 },
      ],
    });

    // Own serials, so the assertions do not depend on what the seed's counters
    // are at when the suite runs.
    const waybill = await prisma.documentSeries.create({
      data: { type: "WAYBILL", prefix: `WT${TAG}`.slice(0, 10), padding: 4 },
    });
    waybillSeriesId = waybill.id;
    const invoiceSeries = await prisma.documentSeries.create({
      data: { type: "INVOICE", prefix: `IT${TAG}`.slice(0, 10), padding: 4 },
    });
    invoiceSeriesId = invoiceSeries.id;

    const promo = await prisma.promotion.create({
      data: {
        name: `FF %10 ${TAG}`,
        priority: 5,
        conditions: [{ type: "CUSTOMER_GROUP_IN", params: { customerGroupIds: [groupId] } }],
        actions: [{ type: "PERCENT_OFF", params: { percent: 10 } }],
      },
    });
    promotionId = promo.id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const orders = await prisma.order.findMany({
      where: { companyId },
      select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.promotion.deleteMany({ where: { id: promotionId } });
    await prisma.documentSeries.deleteMany({
      where: { id: { in: [waybillSeriesId, invoiceSeriesId] } },
    });
    await prisma.price.deleteMany({ where: { variantId: { in: [variantA, variantB] } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  /** A fresh order of 100 × A (10,00) + 50 × B (20,00) = 2.000 ₺, less 10 %. */
  async function freshOrder(shippingFee = 0) {
    return createOrder(
      {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        shippingFee,
        items: [
          { variantId: variantA, quantity: 100 },
          { variantId: variantB, quantity: 50 },
        ],
      },
      {
        createdById: shippingFee > 0 ? adminId : buyerId,
        createdByRole: shippingFee > 0 ? "SUPER_ADMIN" : "COMPANY_ADMIN",
      },
    );
  }

  describe("numbering", () => {
    it("hands out padded, sequential numbers and never repeats one", async () => {
      const order = await freshOrder();
      const lines = await getOpenLines(order.orderId);

      const first = await createShipment(
        order.orderId,
        { items: [{ orderItemId: lines[0]!.orderItemId, quantity: 10 }] },
        ADMIN,
      );
      const second = await createShipment(
        order.orderId,
        { items: [{ orderItemId: lines[0]!.orderItemId, quantity: 10 }] },
        ADMIN,
      );

      expect(first.documentNumber).toMatch(/0001$/);
      expect(second.documentNumber).toMatch(/0002$/);

      // Cancelling burns the number rather than returning it to the pool.
      await cancelShipment(second.shipmentId, ADMIN);
      const third = await createShipment(
        order.orderId,
        { items: [{ orderItemId: lines[0]!.orderItemId, quantity: 10 }] },
        ADMIN,
      );
      expect(third.documentNumber).toMatch(/0003$/);
    });

    it("takes the ERP's number when one is supplied, leaving our counter alone", async () => {
      const order = await freshOrder();
      const lines = await getOpenLines(order.orderId);
      const before = await prisma.documentSeries.findUniqueOrThrow({
        where: { id: waybillSeriesId },
        select: { lastNumber: true },
      });

      const shipment = await createShipment(
        order.orderId,
        {
          items: [{ orderItemId: lines[0]!.orderItemId, quantity: 5 }],
          externalNumber: "ERP-2026-0001",
        },
        ADMIN,
      );
      expect(shipment.documentNumber).toBe("ERP-2026-0001");

      const after = await prisma.documentSeries.findUniqueOrThrow({
        where: { id: waybillSeriesId },
        select: { lastNumber: true },
      });
      expect(after.lastNumber).toBe(before.lastNumber);
    });

    it("refuses to invent a number when the serial belongs to the ERP", async () => {
      await prisma.documentSeries.update({
        where: { id: waybillSeriesId },
        data: { externalOnly: true },
      });
      const order = await freshOrder();
      const lines = await getOpenLines(order.orderId);

      await expect(
        createShipment(
          order.orderId,
          { items: [{ orderItemId: lines[0]!.orderItemId, quantity: 1 }] },
          ADMIN,
        ),
      ).rejects.toMatchObject({ code: "EXTERNAL_NUMBER_REQUIRED" });

      await prisma.documentSeries.update({
        where: { id: waybillSeriesId },
        data: { externalOnly: false },
      });
    });
  });

  describe("partial despatch", () => {
    it("moves the order to PROCESSING, then SHIPPED only when nothing is left", async () => {
      const order = await freshOrder();
      const lines = await getOpenLines(order.orderId);
      const a = lines.find((l) => l.sku.startsWith("FFA"))!;
      const b = lines.find((l) => l.sku.startsWith("FFB"))!;

      const partial = await createShipment(
        order.orderId,
        { items: [{ orderItemId: a.orderItemId, quantity: 40 }] },
        ADMIN,
      );
      expect(partial.orderStatus).toBe("PROCESSING");

      const rest = await createShipment(
        order.orderId,
        {
          items: [
            { orderItemId: a.orderItemId, quantity: 60 },
            { orderItemId: b.orderItemId, quantity: 50 },
          ],
        },
        ADMIN,
      );
      expect(rest.orderStatus).toBe("SHIPPED");

      const after = await getOpenLines(order.orderId);
      expect(after.every((l) => l.remainingToShip === 0)).toBe(true);
      expect(await listShipments(order.orderId)).toHaveLength(2);
    });

    it("refuses to despatch more than the line has left", async () => {
      const order = await freshOrder();
      const lines = await getOpenLines(order.orderId);
      await expect(
        createShipment(
          order.orderId,
          { items: [{ orderItemId: lines[0]!.orderItemId, quantity: 999 }] },
          ADMIN,
        ),
      ).rejects.toMatchObject({ code: "OVER_SHIPMENT" });
    });

    it("walks the status back when a despatch is cancelled", async () => {
      const order = await freshOrder();
      const lines = await getOpenLines(order.orderId);
      const shipment = await createShipment(
        order.orderId,
        { items: [{ orderItemId: lines[0]!.orderItemId, quantity: 10 }] },
        ADMIN,
      );

      const { orderStatus } = await cancelShipment(shipment.shipmentId, ADMIN);
      expect(orderStatus).toBe("CONFIRMED");
      const after = await getOpenLines(order.orderId);
      expect(after[0]!.quantityShipped).toBe(0);
    });

    it("blocks cancelling an order that has already despatched something", async () => {
      const order = await freshOrder();
      const lines = await getOpenLines(order.orderId);
      await createShipment(
        order.orderId,
        { items: [{ orderItemId: lines[0]!.orderItemId, quantity: 1 }] },
        ADMIN,
      );

      await expect(
        changeOrderStatus(
          order.orderId,
          { status: "CANCELLED" },
          { userId: adminId, role: "SUPER_ADMIN", companyId: null },
        ),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
  });

  describe("invoicing", () => {
    it("bills a despatch and splits the campaign discount by quantity", async () => {
      const order = await freshOrder();
      const detail = await getOrderDetail(order.orderId, {
        userId: adminId,
        role: "SUPER_ADMIN",
        companyId: null,
      });
      // 100 × 10 + 50 × 20 = 2.000, campaign takes 10 % → 200.
      expect(detail.subtotal).toBe("2000.00");
      expect(detail.promotionTotal).toBe("200.00");

      const lines = await getOpenLines(order.orderId);
      const a = lines.find((l) => l.sku.startsWith("FFA"))!;
      const b = lines.find((l) => l.sku.startsWith("FFB"))!;

      const half = await createShipment(
        order.orderId,
        { items: [{ orderItemId: a.orderItemId, quantity: 50 }] },
        ADMIN,
      );
      const firstInvoice = await createInvoice(
        order.orderId,
        { shipmentIds: [half.shipmentId] },
        ADMIN,
      );
      // Half of line A: 500 gross, 50 campaign (half of A's 100), VAT on 450.
      expect(firstInvoice.grandTotal).toBe("540.00");

      const rest = await createShipment(
        order.orderId,
        {
          items: [
            { orderItemId: a.orderItemId, quantity: 50 },
            { orderItemId: b.orderItemId, quantity: 50 },
          ],
        },
        ADMIN,
      );
      const secondInvoice = await createInvoice(
        order.orderId,
        { shipmentIds: [rest.shipmentId] },
        ADMIN,
      );

      // The two invoices must add back up to the order, to the kuruş.
      const invoices = await listInvoices(order.orderId);
      const sum = invoices
        .filter((i) => i.status === "ISSUED")
        .reduce((n, i) => n + Number(i.grandTotal), 0);
      expect(sum.toFixed(2)).toBe(detail.grandTotal);
      expect(secondInvoice.grandTotal).toBe(
        (Number(detail.grandTotal) - 540).toFixed(2),
      );
    });

    it("bills everything outstanding when no despatch is named", async () => {
      const order = await freshOrder();
      const invoice = await createInvoice(order.orderId, {}, ADMIN);

      const detail = await getOrderDetail(order.orderId, {
        userId: adminId,
        role: "SUPER_ADMIN",
        companyId: null,
      });
      expect(invoice.grandTotal).toBe(detail.grandTotal);

      const lines = await getOpenLines(order.orderId);
      expect(lines.every((l) => l.remainingToInvoice === 0)).toBe(true);

      await expect(createInvoice(order.orderId, {}, ADMIN)).rejects.toMatchObject({
        code: "NOTHING_TO_INVOICE",
      });
    });

    it("refuses to bill the same despatch twice", async () => {
      const order = await freshOrder();
      const lines = await getOpenLines(order.orderId);
      const shipment = await createShipment(
        order.orderId,
        { items: [{ orderItemId: lines[0]!.orderItemId, quantity: 10 }] },
        ADMIN,
      );
      await createInvoice(order.orderId, { shipmentIds: [shipment.shipmentId] }, ADMIN);

      await expect(
        createInvoice(order.orderId, { shipmentIds: [shipment.shipmentId] }, ADMIN),
      ).rejects.toMatchObject({ code: "ALREADY_INVOICED" });
    });

    it("charges freight once, on the first invoice", async () => {
      const order = await freshOrder(150);
      const lines = await getOpenLines(order.orderId);
      const a = lines.find((l) => l.sku.startsWith("FFA"))!;

      const firstShipment = await createShipment(
        order.orderId,
        { items: [{ orderItemId: a.orderItemId, quantity: 100 }] },
        ADMIN,
      );
      await createInvoice(order.orderId, { shipmentIds: [firstShipment.shipmentId] }, ADMIN);
      const second = await createInvoice(order.orderId, {}, ADMIN);

      const invoices = await listInvoices(order.orderId);
      expect(invoices[0]!.shippingFee).toBe("150.00");
      expect(second.grandTotal).not.toContain("150");
      expect(invoices[1]!.shippingFee).toBe("0.00");
    });

    it("frees the quantities again when an invoice is cancelled", async () => {
      const order = await freshOrder();
      const invoice = await createInvoice(order.orderId, {}, ADMIN);

      await cancelInvoice(invoice.invoiceId, ADMIN);
      const lines = await getOpenLines(order.orderId);
      expect(lines.every((l) => l.remainingToInvoice === l.quantity)).toBe(true);

      // And the number is not reissued: the next invoice takes a fresh one.
      const next = await createInvoice(order.orderId, {}, ADMIN);
      expect(next.documentNumber).not.toBe(invoice.documentNumber);
    });
  });

  describe("due dates", () => {
    it("takes the due date from the invoice, not the order", async () => {
      const order = await freshOrder();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 90);

      await createInvoice(
        order.orderId,
        { dueDate: dueDate.toISOString() },
        ADMIN,
      );

      const debit = await prisma.transaction.findFirstOrThrow({
        where: { orderId: order.orderId, type: "DEBIT" },
        select: { dueDate: true },
      });
      expect(debit.dueDate?.toISOString().slice(0, 10)).toBe(
        dueDate.toISOString().slice(0, 10),
      );
    });

    it("ages an overdue invoice into a bucket instead of calling it current", async () => {
      const order = await freshOrder();
      const past = new Date();
      past.setDate(past.getDate() - 45);
      await createInvoice(order.orderId, { dueDate: past.toISOString() }, ADMIN);

      const aging = await getCompanyAging(companyId);
      // 45 days past due lands in the 31-60 bucket.
      expect(Number(aging.buckets.d31_60)).toBeGreaterThan(0);
      expect(Number(aging.overdue)).toBeGreaterThan(0);
    });
  });
});
