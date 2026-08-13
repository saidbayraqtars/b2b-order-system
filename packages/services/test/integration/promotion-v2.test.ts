import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import { buildQuote } from "../../src/order-quote";
import { createPromotion } from "../../src/promotion-admin";

// The half of promotion v2 the pure engine cannot test: gifts have to be priced
// against the catalogue, and the arithmetic has to keep tying out once a free
// line is in the order.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `p2${Date.now()}`;

let groupId: string;
let categoryId: string;
let companyId: string;
let buyerId: string;
let adminId: string;
let productId: string;
let paidVariant: string;
let giftVariant: string;
let scarceVariant: string;
let unpricedVariant: string;
const promotionIds: string[] = [];

suite("promotion v2: gifts and shipping", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({ data: { name: `P2 Grup ${TAG}` } });
    groupId = group.id;
    const category = await prisma.category.create({
      data: { name: `P2 Kategori ${TAG}`, slug: `p2-kat-${TAG}` },
    });
    categoryId = category.id;
    const company = await prisma.company.create({
      data: { name: `P2 Firma ${TAG}`, customerGroupId: groupId, creditLimit: 10_000_000 },
    });
    companyId = company.id;

    const buyer = await prisma.user.create({
      data: {
        email: `p2-buyer-${TAG}@test.local`,
        name: "P2 Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;
    const admin = await prisma.user.create({
      data: {
        email: `p2-admin-${TAG}@test.local`,
        name: "P2 Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    const product = await prisma.product.create({
      data: {
        name: `P2 Ürün ${TAG}`,
        slug: `p2-urun-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: {
          create: [
            { sku: `P2A-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 10_000 },
            { sku: `P2G-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 10_000 },
            { sku: `P2S-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 2 },
            { sku: `P2U-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 100 },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    const sku = (p: string) => product.variants.find((v) => v.sku.startsWith(p))!.id;
    paidVariant = sku("P2A");
    giftVariant = sku("P2G");
    scarceVariant = sku("P2S");
    unpricedVariant = sku("P2U");

    await prisma.price.createMany({
      data: [
        { variantId: paidVariant, minQuantity: 1, price: 100 },
        { variantId: giftVariant, minQuantity: 1, price: 40 },
        { variantId: scarceVariant, minQuantity: 1, price: 25 },
        // unpricedVariant deliberately has none.
      ],
    });
  });

  beforeEach(async () => {
    if (!hasDb) return;
    await prisma.promotionRedemption.deleteMany({
      where: { promotionId: { in: promotionIds } },
    });
    await prisma.promotion.deleteMany({ where: { id: { in: promotionIds } } });
    promotionIds.length = 0;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const orders = await prisma.order.findMany({ where: { companyId }, select: { id: true } });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    // By name as well as by id: a validation test that unexpectedly passes
    // would otherwise leave a campaign behind for every later run to trip over.
    await prisma.promotion.deleteMany({ where: { id: { in: promotionIds } } });
    await prisma.promotion.deleteMany({ where: { name: { contains: TAG } } });
    await prisma.price.deleteMany({
      where: { variantId: { in: [paidVariant, giftVariant, scarceVariant, unpricedVariant] } },
    });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  async function campaign(data: {
    actions: unknown[];
    conditions?: unknown[];
    conditionMode?: "ALL" | "ANY";
  }) {
    const promo = await prisma.promotion.create({
      data: {
        name: `P2 Kampanya ${TAG}-${promotionIds.length}`,
        priority: promotionIds.length,
        conditionMode: data.conditionMode ?? "ALL",
        conditions: (data.conditions ?? []) as never,
        actions: data.actions as never,
      },
    });
    promotionIds.push(promo.id);
    return promo.id;
  }

  const cart = (quantity = 10) => ({
    companyId,
    paymentMethod: "OPEN_ACCOUNT" as const,
    items: [{ variantId: paidVariant, quantity }],
  });

  describe("gifts", () => {
    it("adds a free line at its own value and cancels it with an equal discount", async () => {
      await campaign({
        actions: [{ type: "GIFT_ITEM", params: { variantId: giftVariant, quantity: 3 } }],
      });

      const quote = await buildQuote(prisma, cart());
      const gift = quote.lines.find((l) => l.isGift)!;

      expect(gift.quantity).toBe(3);
      expect(gift.lineGross.toFixed(2)).toBe("120.00"); // 3 × 40,00
      expect(gift.promotionDiscount.toFixed(2)).toBe("120.00");
      expect(gift.lineNet.toFixed(2)).toBe("0.00");
      expect(gift.lineTax.toFixed(2)).toBe("0.00");

      // The buyer pays for the goods they chose and nothing for the gift.
      expect(quote.subtotal.toFixed(2)).toBe("1120.00");
      expect(quote.promotionTotal.toFixed(2)).toBe("120.00");
      expect(quote.taxTotal.toFixed(2)).toBe("200.00");
      expect(quote.grandTotal.toFixed(2)).toBe("1200.00");

      // The campaign gets credited with what it actually gave away.
      expect(quote.appliedPromotions[0]!.amount.toFixed(2)).toBe("120.00");
    });

    it("keeps the order arithmetic tied out once the gift is a line", async () => {
      await campaign({
        actions: [{ type: "GIFT_ITEM", params: { variantId: giftVariant, quantity: 2 } }],
      });

      const created = await createOrder(cart(), {
        createdById: buyerId,
        createdByRole: "COMPANY_ADMIN",
      });
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: created.orderId },
        include: { items: true },
      });

      const gift = order.items.find((i) => i.isGift)!;
      expect(gift.quantity).toBe(2);
      expect(gift.lineTotal.toFixed(2)).toBe("0.00");

      const lineSum = order.items.reduce(
        (n, i) => n + Number(i.lineTotal),
        0,
      );
      const expected =
        Number(order.subtotal) - Number(order.discountTotal) - Number(order.promotionTotal);
      expect(lineSum.toFixed(2)).toBe(expected.toFixed(2));
      expect(Number(order.grandTotal).toFixed(2)).toBe(
        (expected + Number(order.taxTotal) + Number(order.shippingFee)).toFixed(2),
      );
    });

    it("reserves stock for the gift like any other line", async () => {
      await campaign({
        actions: [{ type: "GIFT_ITEM", params: { variantId: giftVariant, quantity: 5 } }],
      });
      const before = await prisma.productVariant.findUniqueOrThrow({
        where: { id: giftVariant },
        select: { stock: true },
      });

      await createOrder(cart(), { createdById: buyerId, createdByRole: "COMPANY_ADMIN" });

      const after = await prisma.productVariant.findUniqueOrThrow({
        where: { id: giftVariant },
        select: { stock: true },
      });
      expect(after.stock).toBe(before.stock - 5);
    });

    it("gives what stock allows rather than failing the order", async () => {
      await campaign({
        actions: [{ type: "GIFT_ITEM", params: { variantId: scarceVariant, quantity: 50 } }],
      });

      const quote = await buildQuote(prisma, cart());
      const gift = quote.lines.find((l) => l.isGift)!;
      expect(gift.quantity).toBe(2); // all there is
    });

    it("skips a gift the company could never be charged for", async () => {
      await campaign({
        actions: [{ type: "GIFT_ITEM", params: { variantId: unpricedVariant, quantity: 1 } }],
      });

      const quote = await buildQuote(prisma, cart());
      expect(quote.lines.some((l) => l.isGift)).toBe(false);
      expect(quote.promotionTotal.toFixed(2)).toBe("0.00");
    });

    it("does not hand out stock the paid lines are already holding", async () => {
      await campaign({
        actions: [{ type: "GIFT_ITEM", params: { variantId: scarceVariant, quantity: 5 } }],
      });

      const quote = await buildQuote(prisma, {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [
          { variantId: paidVariant, quantity: 1 },
          { variantId: scarceVariant, quantity: 2 }, // the whole stock
        ],
      });
      expect(quote.lines.some((l) => l.isGift)).toBe(false);
    });
  });

  describe("quantity ladders", () => {
    const ladder = [
      { minQuantity: 10, value: 1 },
      { minQuantity: 50, value: 6 },
    ];

    it("prices the rung the cart actually reached", async () => {
      await campaign({
        actions: [
          { type: "GIFT_TIER", params: { variantId: giftVariant, tiers: ladder } },
        ],
      });

      const low = await buildQuote(prisma, cart(10));
      expect(low.lines.find((l) => l.isGift)!.quantity).toBe(1);

      const high = await buildQuote(prisma, cart(50));
      const gift = high.lines.find((l) => l.isGift)!;
      expect(gift.quantity).toBe(6);
      expect(gift.lineGross.toFixed(2)).toBe("240.00"); // 6 × 40,00
      expect(gift.lineNet.toFixed(2)).toBe("0.00");
      expect(high.promotionTotal.toFixed(2)).toBe("240.00");
    });

    it("replaces the lower rung instead of adding to it", async () => {
      // The same ladder as three separate campaigns used to stack; one campaign
      // must give 6 at fifty, not 1 + 6, and not the 5 that "one per ten" gives.
      await campaign({
        actions: [
          { type: "GIFT_TIER", params: { variantId: giftVariant, tiers: ladder } },
        ],
      });

      const quote = await buildQuote(prisma, cart(50));
      expect(quote.lines.filter((l) => l.isGift)).toHaveLength(1);
      expect(quote.appliedPromotions).toHaveLength(1);
    });

    it("discounts by the rung the quantity reached", async () => {
      await campaign({
        actions: [
          {
            type: "PERCENT_OFF_TIER",
            params: {
              tiers: [
                { minQuantity: 10, value: 5 },
                { minQuantity: 50, value: 10 },
              ],
            },
          },
        ],
      });

      const quote = await buildQuote(prisma, cart(50)); // 50 × 100,00
      expect(quote.promotionTotal.toFixed(2)).toBe("500.00");
      expect(quote.grandTotal.toFixed(2)).toBe("5400.00"); // 4500 + %20
    });

    it("refuses a backwards ladder on the way in, and skips it on the way out", async () => {
      const backwards = [
        {
          type: "GIFT_TIER",
          params: {
            variantId: giftVariant,
            tiers: [
              { minQuantity: 10, value: 6 },
              { minQuantity: 50, value: 1 },
            ],
          },
        },
      ];

      // The admin screen is where this is caught, and it is caught by the same
      // code the engine runs.
      await expect(
        createPromotion({
          name: `P2 Ters ${TAG}`,
          conditions: [],
          actions: backwards as never,
        }),
      ).rejects.toThrow(/az veriyor/i);

      // Written straight into the table it must not stop the order: a campaign
      // nobody can read is skipped, exactly like an unknown rule type.
      await campaign({ actions: backwards });
      const quote = await buildQuote(prisma, cart(50));
      expect(quote.lines.some((l) => l.isGift)).toBe(false);
      expect(quote.appliedPromotions).toHaveLength(0);
    });
  });

  describe("shipping", () => {
    it("discounts the freight and taxes only what is left of it", async () => {
      await campaign({
        actions: [{ type: "SHIPPING_PERCENT_OFF", params: { percent: 50 } }],
      });

      const quote = await buildQuote(prisma, { ...cart(), shippingFee: 200 });

      expect(quote.shippingFee.toFixed(2)).toBe("100.00");
      expect(quote.shippingDiscount.toFixed(2)).toBe("100.00");
      // Goods-only, because the freight discount is already gone from the
      // freight. Counting it here as well would take it off the order twice.
      expect(quote.promotionTotal.toFixed(2)).toBe("0.00");
      // The buyer still sees what the campaign gave them, all of it.
      expect(quote.appliedPromotions[0]!.amount.toFixed(2)).toBe("100.00");
      // 1000 goods VAT 200 + 100 freight VAT 20.
      expect(quote.taxTotal.toFixed(2)).toBe("220.00");
      expect(quote.grandTotal.toFixed(2)).toBe("1320.00");
    });

    it("stores the discounted freight on the order, not the asking price", async () => {
      await campaign({ actions: [{ type: "FREE_SHIPPING", params: {} }] });

      const created = await createOrder(
        { ...cart(), shippingFee: 150 },
        { createdById: adminId, createdByRole: "SUPER_ADMIN" },
      );
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: created.orderId },
        select: {
          shippingFee: true,
          shippingDiscount: true,
          promotionTotal: true,
          grandTotal: true,
        },
      });

      expect(order.shippingFee.toFixed(2)).toBe("0.00");
      expect(order.shippingDiscount.toFixed(2)).toBe("150.00");
      expect(order.promotionTotal.toFixed(2)).toBe("0.00");
      expect(order.grandTotal.toFixed(2)).toBe("1200.00");
    });

    it("keeps promotionTotal equal to what the lines carry, freight aside", async () => {
      await campaign({
        actions: [
          { type: "PERCENT_OFF", params: { percent: 10 } },
          { type: "FREE_SHIPPING", params: {} },
        ],
      });

      const created = await createOrder(
        { ...cart(), shippingFee: 80 },
        { createdById: adminId, createdByRole: "SUPER_ADMIN" },
      );
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: created.orderId },
        include: { items: true },
      });

      // The invoice splits promotionTotal across the lines, so the two must
      // agree exactly — a freight discount hiding in there would misallocate.
      const lineDiscounts = order.items.reduce(
        (n, i) => n + Number(i.promotionDiscount),
        0,
      );
      expect(lineDiscounts.toFixed(2)).toBe(Number(order.promotionTotal).toFixed(2));
      expect(order.shippingDiscount.toFixed(2)).toBe("80.00");
    });
  });

  describe("condition mode", () => {
    it("needs every condition in ALL and only one in ANY", async () => {
      const conditions = [
        { type: "CUSTOMER_GROUP_IN", params: { customerGroupIds: [groupId] } },
        { type: "FIRST_ORDER", params: {} },
      ];

      // The company already has orders from the tests above, so FIRST_ORDER is
      // false while the group condition is true.
      await createOrder(cart(), { createdById: buyerId, createdByRole: "COMPANY_ADMIN" });

      await campaign({
        conditions,
        actions: [{ type: "PERCENT_OFF", params: { percent: 10 } }],
      });
      expect((await buildQuote(prisma, cart())).promotionTotal.toFixed(2)).toBe("0.00");

      await prisma.promotion.updateMany({
        where: { id: { in: promotionIds } },
        data: { conditionMode: "ANY" },
      });
      expect((await buildQuote(prisma, cart())).promotionTotal.toFixed(2)).toBe("100.00");
    });
  });
});
