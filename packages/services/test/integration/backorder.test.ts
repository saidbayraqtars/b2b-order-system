import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { getBackorders } from "../../src/backorder";

// Bekleyen bakiye: sipariş edilip sevk edilmemiş mal.
//
// Paket kendi siparişlerini kuruyor ve **yalnızca onlara** bakıyor: aynı
// veritabanında gösterim verisi ve başka paketlerin siparişleri de duruyor,
// toplamlara bakan bir test onlarla birlikte kırılırdı.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `bo${Date.now()}`;

let categoryId: string;
let productId: string;
let variantId: string;
let companyId: string;
let userId: string;
let openOrderId: string;
let deliveredOrderId: string;

suite("bekleyen bakiye", () => {
  beforeAll(async () => {
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
        variants: {
          create: [{ sku: `SKU-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 30 }],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;

    const company = await prisma.company.create({
      data: { name: `Bekleyen ${TAG}`, creditLimit: 1_000_000 },
    });
    companyId = company.id;

    const user = await prisma.user.create({
      data: {
        email: `bo-${TAG}@test.local`,
        name: "Bekleyen Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    userId = user.id;

    // Açık sipariş: 100 sipariş, 40 sevk → 60 bekliyor, elde 30.
    const open = await prisma.order.create({
      data: {
        orderNumber: `BO-${TAG}-1`,
        status: "PROCESSING",
        companyId,
        createdById: userId,
        // Yaş hesabı sınansın diye on gün öncesi.
        createdAt: new Date(Date.now() - 10 * 86_400_000),
        items: {
          create: [
            {
              variantId,
              productName: `Ürün ${TAG}`,
              sku: `SKU-${TAG}`,
              quantity: 100,
              quantityShipped: 40,
              unitPrice: 10,
              lineTotal: 1000,
            },
          ],
        },
      },
    });
    openOrderId = open.id;

    // Teslim edilmiş sipariş, eksik sevkiyatla: listeye **girmemeli**.
    const delivered = await prisma.order.create({
      data: {
        orderNumber: `BO-${TAG}-2`,
        status: "DELIVERED",
        companyId,
        createdById: userId,
        items: {
          create: [
            {
              variantId,
              productName: `Ürün ${TAG}`,
              sku: `SKU-${TAG}`,
              quantity: 50,
              quantityShipped: 20,
              unitPrice: 10,
              lineTotal: 500,
            },
          ],
        },
      },
    });
    deliveredOrderId = delivered.id;
  });

  afterAll(async () => {
    const ids = [openOrderId, deliveredOrderId];
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it("sevk edilmemiş bakiyeyi satır olarak veriyor", async () => {
    const report = await getBackorders();
    const mine = report.lines.filter((l) => l.orderId === openOrderId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      quantity: 100,
      quantityShipped: 40,
      pending: 60,
      onHand: 30,
      ageDays: 10,
    });
  });

  it("teslim edilmiş sipariş listeye girmiyor", async () => {
    const report = await getBackorders();
    expect(report.lines.some((l) => l.orderId === deliveredOrderId)).toBe(false);
  });

  it("varyant özeti eldeki mal yetmediğinde 'mal gerekiyor' diyor", async () => {
    const report = await getBackorders();
    const v = report.variants.find((x) => x.variantId === variantId);
    // 60 bekliyor, elde 30 → karşılanamıyor.
    expect(v).toMatchObject({ pending: 60, onHand: 30, coverable: false });
  });

  it("mal gelince karşılanabilir oluyor", async () => {
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { stock: 200 },
    });
    const report = await getBackorders();
    const v = report.variants.find((x) => x.variantId === variantId);
    expect(v?.coverable).toBe(true);
    // Karşılanabilen toplam bu varyantın bekleyenini içeriyor.
    expect(report.coverablePending).toBeGreaterThanOrEqual(60);
  });

  it("tamamen sevk edilmiş satır listeye girmiyor", async () => {
    await prisma.orderItem.updateMany({
      where: { orderId: openOrderId },
      data: { quantityShipped: 100 },
    });
    const report = await getBackorders();
    expect(report.lines.some((l) => l.orderId === openOrderId)).toBe(false);
  });
});
