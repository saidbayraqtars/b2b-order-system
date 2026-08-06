import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import { quoteOrder } from "../../src/order-quote";
import { changeOrderStatus, getOrderDetail } from "../../src/order-lifecycle";
import { listCatalog } from "../../src/catalog";
import { getVolumeStatus } from "../../src/volume-discount";

// The hacim ladder against a real database: turnover is a SQL aggregate over
// real orders, so what the unit tests mock is exactly what has to be proven
// here — that placing an order changes the price of the next one, and that
// cancelling it changes it back.
//
// The tier this suite defines is deliberately unreachable (1.000.000 ₺): the
// ladder is global, so a low threshold would silently discount every other
// integration suite's fixtures running against the same database.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `vol${Date.now()}`;
const THRESHOLD = 1_000_000;

let groupId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let tierId: string;
let earnCompanyId: string;
let pinCompanyId: string;
let buyerId: string;
let adminId: string;
let ADMIN_CTX: { userId: string; role: "SUPER_ADMIN"; companyId: null };

/** 100,00 × 20.000 = 2.000.000 — one order that clears the threshold twice over. */
const BIG = 20_000;

suite("hacim iskontosu integration", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({ data: { name: `Grup ${TAG}` } });
    groupId = group.id;

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` },
    });
    categoryId = category.id;

    const tier = await prisma.volumeTier.create({
      data: {
        name: `Basamak ${TAG}`,
        minRevenue: THRESHOLD,
        windowMonths: 12,
        // Above every seeded rung, so this suite's assertions hold whether or
        // not the database was seeded — `bestTier` picks the highest rate.
        discountPercent: 10,
      },
    });
    tierId = tier.id;

    const earn = await prisma.company.create({
      data: {
        name: `Kazanan ${TAG}`,
        creditLimit: 100_000_000,
        customerGroupId: groupId,
      },
    });
    earnCompanyId = earn.id;

    const pin = await prisma.company.create({
      data: {
        name: `Sozlesmeli ${TAG}`,
        creditLimit: 100_000_000,
        customerGroupId: groupId,
        // Never trades, yet must be priced at the rung it was promised.
        volumeDiscountMode: "MANUAL",
        volumeTierId: tierId,
      },
    });
    pinCompanyId = pin.id;

    const buyer = await prisma.user.create({
      data: {
        email: `buyer-${TAG}@test.local`,
        name: "Hacim Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId: earnCompanyId,
      },
    });
    buyerId = buyer.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Hacim Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;
    ADMIN_CTX = { userId: admin.id, role: "SUPER_ADMIN", companyId: null };

    const product = await prisma.product.create({
      data: {
        name: `Ürün ${TAG}`,
        slug: `urun-${TAG}`,
        vatRate: 20,
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
  });

  afterAll(async () => {
    const companies = [earnCompanyId, pinCompanyId];
    const orders = await prisma.order.findMany({
      where: { companyId: { in: companies } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.transaction.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.orderStatusHistory.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.volumeTier.deleteMany({ where: { id: tierId } });
    await prisma.$disconnect();
  });

  const items = (quantity: number) => [{ variantId, quantity }];
  const earner = () => ({
    companyId: earnCompanyId,
    paymentMethod: "OPEN_ACCOUNT" as const,
  });

  describe("earning the rung", () => {
    it("charges the full price before any turnover exists", async () => {
      const q = await quoteOrder({ ...earner(), items: items(10) });
      expect(q.lines[0]!.unitPrice).toBe("100.00");
      expect(q.lines[0]!.discountPerUnit).toBe("0.00");
      expect(q.volumeDiscount).toBeNull();
    });

    it("reports the gap to the next rung", async () => {
      const status = await getVolumeStatus(earnCompanyId);
      expect(status.mode).toBe("AUTO");
      expect(status.current).toBeNull();
      expect(status.next?.name).toBe(`Basamak ${TAG}`);
    });

    it("discounts the next order once the threshold is crossed", async () => {
      const first = await createOrder(
        { ...earner(), items: items(BIG) },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );
      expect(first.status).toBe("CONFIRMED");

      // That first order was priced before its own turnover existed, so it pays
      // full price — the ladder rewards what a customer has already bought, not
      // what it is buying now.
      const firstDetail = await getOrderDetail(first.orderId, ADMIN_CTX);
      expect(firstDetail.volumeTier).toBeNull();
      expect(firstDetail.discountTotal).toBe("0.00");

      const q = await quoteOrder({ ...earner(), items: items(10) });
      expect(q.volumeDiscount).toEqual({
        tierName: `Basamak ${TAG}`,
        percent: "10.00",
        amount: "100.00", // 10 units × 10,00
      });
      expect(q.lines[0]!.discountPerUnit).toBe("10.00");
      expect(q.subtotal).toBe("1000.00");
      expect(q.discountTotal).toBe("100.00");
      expect(q.taxTotal).toBe("180.00"); // VAT on the net, not the list
      expect(q.grandTotal).toBe("1080.00");
    });

    it("shows the same price in the catalogue as in the cart", async () => {
      // A rung that only appeared at checkout would read as a bait-and-switch
      // in reverse: the customer browses at one price and pays another.
      const catalog = await listCatalog({ companyId: earnCompanyId, categoryId });
      const variant = catalog[0]!.variants[0]!;
      expect(variant.unitPrice).toBe("100.00");
      expect(variant.netUnitPrice).toBe("90.00");
    });

    it("snapshots the rung onto the order it was sold under", async () => {
      const order = await createOrder(
        { ...earner(), items: items(10) },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );
      const detail = await getOrderDetail(order.orderId, ADMIN_CTX);
      expect(detail.volumeTier).toEqual({
        name: `Basamak ${TAG}`,
        percent: "10.00",
      });
      expect(detail.items[0]!.discount).toBe("10.00");
      expect(detail.items[0]!.lineTotal).toBe("900.00");

      const item = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.orderId },
        select: { discount: true, volumeDiscount: true },
      });
      // `discount` is the total per unit; `volumeDiscount` is the ladder's share
      // of it — invoicing multiplies the former, reporting reads the latter.
      expect(item.discount.toFixed(2)).toBe("10.00");
      expect(item.volumeDiscount.toFixed(2)).toBe("10.00");
    });

    it("keeps the snapshot after the rung is retired", async () => {
      const order = await prisma.order.findFirstOrThrow({
        where: { companyId: earnCompanyId, volumeTierName: { not: null } },
        select: { id: true },
      });
      await prisma.volumeTier.update({
        where: { id: tierId },
        data: { isActive: false },
      });

      const detail = await getOrderDetail(order.id, ADMIN_CTX);
      expect(detail.volumeTier?.name).toBe(`Basamak ${TAG}`);

      // …while new orders stop earning it.
      const q = await quoteOrder({ ...earner(), items: items(10) });
      expect(q.volumeDiscount).toBeNull();

      await prisma.volumeTier.update({
        where: { id: tierId },
        data: { isActive: true },
      });
    });

    it("gives the rung back when the qualifying order is cancelled", async () => {
      const big = await prisma.order.findFirstOrThrow({
        where: { companyId: earnCompanyId, subtotal: { gte: THRESHOLD } },
        select: { id: true },
      });
      await changeOrderStatus(big.id, { status: "CANCELLED" }, ADMIN_CTX);

      // A cancelled order was un-placed; counting it would let a customer buy a
      // discount for the price of a cancellation.
      const q = await quoteOrder({ ...earner(), items: items(10) });
      expect(q.volumeDiscount).toBeNull();
      expect(q.grandTotal).toBe("1200.00");
    });
  });

  describe("pinned rung", () => {
    it("prices at the promised rate with no turnover at all", async () => {
      const q = await quoteOrder({
        companyId: pinCompanyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: items(10),
      });
      expect(q.volumeDiscount?.percent).toBe("10.00");
      expect(q.grandTotal).toBe("1080.00");
    });

    it("reports no target to chase, because there is nothing to earn", async () => {
      const status = await getVolumeStatus(pinCompanyId);
      expect(status.mode).toBe("MANUAL");
      expect(status.current?.percent).toBe("10.00");
      expect(status.turnover).toBeNull();
      expect(status.next).toBeNull();
    });
  });
});
