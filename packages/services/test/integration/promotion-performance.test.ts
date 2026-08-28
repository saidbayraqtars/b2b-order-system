import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  PERFORMANCE_MIN_ORDERS,
  promotionPerformance,
} from "../../src/promotion-performance";

// Kampanya karnesi.
//
// Sınananlar, hepsi bir kez yanlış yazılması kolay olan şeyler:
//
//  - **İptal edilen sipariş hiçbir sayıya girmiyor.** Kota zaten geri
//    veriliyordu; karne de aynı tanımı kullanmalı, yoksa "kullanım" kolonu
//    kotayla çelişir.
//  - **Az örnekte ortalama yazılmıyor.** Üç siparişin ortalama sepeti bir
//    ortalama değil.
//  - **Pencere kullanımı kesiyor, kampanyayı değil.** Pencerenin dışında
//    kalan bir kampanya listede duruyor, sayıları sıfır.
//  - **"Yeni firma" bütün geçmişe bakıyor**, pencereye değil: üç ay önce alan
//    bir firma, doksan günlük pencerede yeni müşteri değil.
//
// Sayılar kendi kampanyalarımızdan okunuyor, toplamlardan değil: test veritabanı
// paylaşımlı ve başka satırlar da var.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `perf${Date.now()}`;

let adminId: string;
let categoryId: string;
let productId: string;
let variantId: string;
/** Kullanımı olan kampanya. */
let mainId: string;
/** Kotalı kampanya. */
let cappedId: string;
/** Hiç kullanılmamış kampanya — listede kalmalı, sayıları sıfır olmalı. */
let unusedId: string;

const companyIds: string[] = [];
const orderIds: string[] = [];

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

/** Bir sipariş + istenirse kampanya kullanımı. */
async function order(options: {
  companyId: string;
  total: number;
  createdAt: Date;
  status?: "DELIVERED" | "CANCELLED";
  promotionId?: string;
  discount?: number;
}): Promise<string> {
  const row = await prisma.order.create({
    data: {
      orderNumber: `PERF-${TAG}-${orderIds.length}`,
      status: options.status ?? "DELIVERED",
      companyId: options.companyId,
      createdById: adminId,
      createdAt: options.createdAt,
      subtotal: options.total,
      grandTotal: options.total,
      items: {
        create: [
          {
            variantId,
            productName: `Ürün ${TAG}`,
            sku: `SKU-${TAG}`,
            quantity: 1,
            unitPrice: options.total,
            lineTotal: options.total,
          },
        ],
      },
    },
  });
  orderIds.push(row.id);

  if (options.promotionId) {
    await prisma.promotionRedemption.create({
      data: {
        promotionId: options.promotionId,
        orderId: row.id,
        companyId: options.companyId,
        amount: options.discount ?? 0,
        createdAt: options.createdAt,
      },
    });
  }
  return row.id;
}

async function company(name: string): Promise<string> {
  const row = await prisma.company.create({
    data: { name: `${name} ${TAG}`, creditLimit: 10_000_000 },
  });
  companyIds.push(row.id);
  return row.id;
}

/** Karnedeki kendi satırımız. */
async function rowFor(promotionId: string, windowDays: number | null = 90) {
  const result = await promotionPerformance(windowDays, now);
  const row = result.rows.find((r) => r.promotionId === promotionId);
  expect(row).toBeDefined();
  return row!;
}

suite("kampanya karnesi", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `perf-${TAG}@test.local`,
        name: "Karne Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

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

    for (const [key, extra] of [
      ["main", {}],
      ["capped", { usageLimit: 4 }],
      ["unused", {}],
    ] as const) {
      const promo = await prisma.promotion.create({
        data: {
          name: `${key} ${TAG}`,
          enabled: true,
          priority: 100,
          conditionMode: "ALL",
          conditions: [],
          actions: [{ type: "PERCENT_OFF", params: { percent: 10 } }],
          ...extra,
        },
      });
      if (key === "main") mainId = promo.id;
      if (key === "capped") cappedId = promo.id;
      if (key === "unused") unusedId = promo.id;
    }

    // Beş firma, beş kampanyalı sipariş: ortalama sepetin yazılabilmesi için
    // gereken asgari örnek tam bu.
    for (let i = 0; i < PERFORMANCE_MIN_ORDERS; i += 1) {
      const c = await company(`Firma ${i}`);
      await order({
        companyId: c,
        total: 1000,
        createdAt: daysAgo(10),
        promotionId: mainId,
        discount: 100,
      });
    }

    // Altıncı firma: kampanyayı kullandı, sipariş iptal edildi. Hiçbir sayıya
    // girmemeli.
    const cancelled = await company("İptal");
    await order({
      companyId: cancelled,
      total: 9_999_999,
      createdAt: daysAgo(10),
      status: "CANCELLED",
      promotionId: mainId,
      discount: 9_999,
    });

    // Yedinci firma: kampanyayı kullandı, **sonra** yine sipariş verdi.
    const returning = await company("Geri gelen");
    await order({
      companyId: returning,
      total: 500,
      createdAt: daysAgo(30),
      promotionId: cappedId,
      discount: 50,
    });
    await order({ companyId: returning, total: 700, createdAt: daysAgo(5) });

    // Sekizinci firma: kampanyadan **önce** de sipariş vermiş — yeni müşteri
    // değil, ve pencere onu yeni yapmamalı.
    const old = await company("Eski");
    await order({ companyId: old, total: 400, createdAt: daysAgo(200) });
    await order({
      companyId: old,
      total: 600,
      createdAt: daysAgo(20),
      promotionId: cappedId,
      discount: 60,
    });
  });

  afterAll(async () => {
    await prisma.promotionRedemption.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.promotion.deleteMany({
      where: { id: { in: [mainId, cappedId, unusedId] } },
    });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("iptal edilen sipariş hiçbir sayıya girmiyor", async () => {
    const row = await rowFor(mainId);
    // Beş yaşayan kullanım; iptal edilen altıncı ne kullanıma ne ciroya girdi.
    expect(row.redemptions).toBe(PERFORMANCE_MIN_ORDERS);
    expect(row.discountTotal).toBe("500.00");
    expect(row.revenueOnOrders).toBe("5000.00");
  });

  it("iskonto payı, verilen indirimin sipariş cirosuna oranı", async () => {
    const row = await rowFor(mainId);
    expect(row.discountSharePct).toBeCloseTo(10);
  });

  it("asgari örnek dolduğunda ortalama sepet yazılıyor", async () => {
    const row = await rowFor(mainId);
    expect(row.avgOrderValue).toBe("1000.00");
  });

  it("az örnekte ortalama sepet yazılmıyor", async () => {
    // Kotalı kampanyanın iki kullanımı var, eşik beş.
    const row = await rowFor(cappedId);
    expect(row.redemptions).toBeLessThan(PERFORMANCE_MIN_ORDERS);
    expect(row.avgOrderValue).toBeNull();
  });

  it("kota yüzdesi limitten geliyor, limitsizde null", async () => {
    expect((await rowFor(cappedId)).quotaUsedPct).toBeCloseTo(50); // 2 / 4
    expect((await rowFor(mainId)).quotaUsedPct).toBeNull();
  });

  it("hiç kullanılmamış kampanya listede kalıyor, sayıları sıfır", async () => {
    const row = await rowFor(unusedId);
    expect(row.redemptions).toBe(0);
    expect(row.discountTotal).toBe("0.00");
    expect(row.discountSharePct).toBeNull();
    expect(row.avgOrderValue).toBeNull();
  });

  it("yeni firma: ilk siparişi kampanyayla olanlar", async () => {
    // main'in beş firmasının hepsinin ilk siparişi kampanyalıydı.
    expect((await rowFor(mainId)).firstOrderCompanies).toBe(
      PERFORMANCE_MIN_ORDERS,
    );
    // capped'in iki firmasından biri daha önce de sipariş vermişti.
    expect((await rowFor(cappedId)).firstOrderCompanies).toBe(1);
  });

  it("geri gelen: ilk kullanımından sonra yeniden sipariş verenler", async () => {
    // capped'i kullanan iki firmadan biri sonradan yine sipariş verdi.
    expect((await rowFor(cappedId)).returnedCompanies).toBe(1);
    // main'in firmaları bir kez alıp kayboldu.
    expect((await rowFor(mainId)).returnedCompanies).toBe(0);
  });

  it("dar pencere kullanımı kesiyor, kampanyayı listeden düşürmüyor", async () => {
    // Yedi günlük pencerede on gün önceki kullanımlar dışarıda kalıyor.
    const row = await rowFor(mainId, 7);
    expect(row.redemptions).toBe(0);
    expect(row.discountTotal).toBe("0.00");
  });

  it("pencere yok denince başından beri sayılıyor", async () => {
    const row = await rowFor(cappedId, null);
    expect(row.redemptions).toBe(2);
    expect(row.discountTotal).toBe("110.00");
  });
});
