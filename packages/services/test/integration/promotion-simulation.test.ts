import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { simulatePromotion } from "../../src/promotion-simulation";

// Kampanya simülatörü.
//
// Sınanan iki şey: simülasyonun **hiçbir şey yazmaması**, ve satır netinin
// kampanya öncesine doğru geri sarılması — kayıtlı bir kampanyanın indirimi
// düşülmüş `lineTotal` üzerinden hesaplamak, indirimi ikinci kez uygulamak
// olurdu.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `sim${Date.now()}`;

let adminId: string;
let companyId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let promotionId: string;
let limitedId: string;
let orderIds: string[] = [];

/** Aralık: bu ayın tamamı. */
const now = new Date();
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
const RANGE = {
  from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
  to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
};
const at = new Date(now.getFullYear(), now.getMonth(), 15, 12);

suite("kampanya simülatörü", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `sim-${TAG}@test.local`,
        name: "Simülasyon Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    const company = await prisma.company.create({
      data: { name: `Simülasyon ${TAG}`, creditLimit: 10_000_000 },
    });
    companyId = company.id;

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: `Ürün ${TAG}`,
        slug: `urun-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: { create: [{ sku: `SKU-${TAG}`, unitsPerCase: 1, moqUnits: 1 }] },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;

    // İki sipariş. İkincisinde kayıtlı bir kampanya indirimi var: taban geri
    // sarılmazsa simülasyon 900 üzerinden hesaplar, 1000 yerine.
    for (const [i, net] of [1000, 900].entries()) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `SIM-${TAG}-${i}`,
          status: "DELIVERED",
          companyId,
          createdById: adminId,
          createdAt: at,
          subtotal: 1000,
          promotionTotal: i === 1 ? 100 : 0,
          grandTotal: net * 1.2,
          items: {
            create: [
              {
                variantId,
                productName: `Ürün ${TAG}`,
                sku: `SKU-${TAG}`,
                quantity: 10,
                unitPrice: 100,
                promotionDiscount: i === 1 ? 100 : 0,
                lineTotal: net,
              },
            ],
          },
        },
      });
      orderIds.push(order.id);
    }

    // %10 sepet indirimi, kapalı: simülatörün asıl işi kapalı kampanyayı
    // denemek.
    const promo = await prisma.promotion.create({
      data: {
        name: `Deneme %10 ${TAG}`,
        enabled: false,
        priority: 100,
        conditionMode: "ALL",
        conditions: [],
        actions: [{ type: "PERCENT_OFF", params: { percent: 10 } }],
      },
    });
    promotionId = promo.id;

    // Aynı kampanya, tek kullanımlık: kota sırayla tükenmeli.
    const limited = await prisma.promotion.create({
      data: {
        name: `Tek kullanım ${TAG}`,
        enabled: false,
        priority: 100,
        usageLimit: 1,
        conditionMode: "ALL",
        conditions: [],
        actions: [{ type: "PERCENT_OFF", params: { percent: 10 } }],
      },
    });
    limitedId = limited.id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.promotion.deleteMany({
      where: { id: { in: [promotionId, limitedId] } },
    });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("kapalı kampanyayı deneyebiliyor ve tabanı kampanya öncesine sarıyor", async () => {
    const result = await simulatePromotion(promotionId, RANGE);
    const mine = result.orders.filter((o) => o.orderNumber.startsWith(`SIM-${TAG}`));

    expect(result.enabled).toBe(false);
    expect(mine).toHaveLength(2);
    // İkisi de 1.000 net (ikincisinin 100'lük kampanya indirimi geri eklendi),
    // %10 → 100 ₺ indirim.
    for (const row of mine) {
      expect(row.netGoods).toBe("1000.00");
      expect(row.discount).toBe("100.00");
    }
  });

  it("hiçbir şey yazmıyor", async () => {
    const before = await prisma.promotionRedemption.count();
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { promotionTotal: true },
      orderBy: { orderNumber: "asc" },
    });

    await simulatePromotion(promotionId, RANGE);

    expect(await prisma.promotionRedemption.count()).toBe(before);
    const after = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { promotionTotal: true },
      orderBy: { orderNumber: "asc" },
    });
    expect(after).toEqual(orders);
  });

  it("kota zaman sırasında tükeniyor", async () => {
    const result = await simulatePromotion(limitedId, RANGE);
    // Tek kullanımlık: aralıktaki ilk siparişe uygulanır, gerisi kotaya takılır.
    expect(result.ordersMatched).toBe(1);
    expect(result.blockedByQuota).toBeGreaterThanOrEqual(1);
  });

  it("ters aralığı reddediyor", async () => {
    await expect(
      simulatePromotion(promotionId, { from: RANGE.to, to: RANGE.from }),
    ).rejects.toMatchObject({ code: "INVALID_PERIOD" });
  });
});
