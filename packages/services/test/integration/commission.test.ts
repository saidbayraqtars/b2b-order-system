import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  getCommissionAccrual,
  saveCommissionPlan,
} from "../../src/commission";

// Plasiyer primi.
//
// Sınanan şeyler: iki tabanın ayrı hesaplanması, atfın **portföye** göre
// olması, hedef çarpanının yalnızca hedef varken ve tutturulunca uygulanması.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `com${Date.now()}`;

let adminId: string;
let repId: string;
let otherRepId: string;
let companyId: string;
let otherCompanyId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let revenuePlanId: string;
let collectionPlanId: string;

/** Bu ayın ortası — dönem sınırlarından uzak. */
const anchor = new Date(new Date().getFullYear(), new Date().getMonth(), 15, 12);

suite("plasiyer primi", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `com-admin-${TAG}@test.local`,
        name: "Prim Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    const rep = await prisma.user.create({
      data: {
        email: `com-rep-${TAG}@test.local`,
        name: "Primli Plasiyer",
        passwordHash: "x",
        role: "SALES_REP",
      },
    });
    repId = rep.id;

    const other = await prisma.user.create({
      data: {
        email: `com-rep2-${TAG}@test.local`,
        name: "Diğer Plasiyer",
        passwordHash: "x",
        role: "SALES_REP",
      },
    });
    otherRepId = other.id;

    const company = await prisma.company.create({
      data: { name: `Primli ${TAG}`, creditLimit: 10_000_000, salesRepId: repId },
    });
    companyId = company.id;

    const otherCompany = await prisma.company.create({
      data: {
        name: `Başkasının ${TAG}`,
        creditLimit: 10_000_000,
        salesRepId: otherRepId,
      },
    });
    otherCompanyId = otherCompany.id;

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

    // Ciro: 100.000 net mal bedeli (KDV hariç).
    await prisma.order.create({
      data: {
        orderNumber: `COM-${TAG}-1`,
        status: "DELIVERED",
        companyId,
        createdById: adminId,
        createdAt: anchor,
        subtotal: 100_000,
        discountTotal: 0,
        promotionTotal: 0,
        taxTotal: 20_000,
        grandTotal: 120_000,
        items: {
          create: [
            {
              variantId,
              productName: `Ürün ${TAG}`,
              sku: `SKU-${TAG}`,
              quantity: 1,
              unitPrice: 100_000,
              lineTotal: 100_000,
            },
          ],
        },
      },
    });

    // İptal edilmiş sipariş: ciroya girmemeli.
    await prisma.order.create({
      data: {
        orderNumber: `COM-${TAG}-2`,
        status: "CANCELLED",
        companyId,
        createdById: adminId,
        createdAt: anchor,
        subtotal: 500_000,
        grandTotal: 600_000,
      },
    });

    // Başka plasiyerin carisi: bu plasiyerin primine girmemeli.
    await prisma.order.create({
      data: {
        orderNumber: `COM-${TAG}-3`,
        status: "DELIVERED",
        companyId: otherCompanyId,
        createdById: adminId,
        createdAt: anchor,
        subtotal: 900_000,
        grandTotal: 1_080_000,
      },
    });

    // Tahsilat: 40.000 — **admin** girdi, ama cari bu plasiyerin portföyünde.
    await prisma.transaction.create({
      data: {
        companyId,
        type: "CREDIT",
        amount: 40_000,
        description: `${TAG} tahsilat`,
        createdAt: anchor,
        recordedById: adminId,
      },
    });

    revenuePlanId = (
      await saveCommissionPlan({
        name: `Ciro primi ${TAG}`,
        base: "REVENUE",
        rate: 2,
        period: "MONTHLY",
        repIds: [repId],
      })
    ).id;

    collectionPlanId = (
      await saveCommissionPlan({
        name: `Tahsilat primi ${TAG}`,
        base: "COLLECTION",
        rate: 5,
        period: "MONTHLY",
        targetMultiplier: 2,
        repIds: [repId],
      })
    ).id;
  });

  afterAll(async () => {
    const companies = [companyId, otherCompanyId];
    const orders = await prisma.order.findMany({
      where: { companyId: { in: companies } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.transaction.deleteMany({
      where: { companyId: { in: companies } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.salesTarget.deleteMany({ where: { salesRepId: repId } });
    await prisma.commissionPlan.deleteMany({
      where: { id: { in: [revenuePlanId, collectionPlanId] } },
    });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, repId, otherRepId] } },
    });
    await prisma.$disconnect();
  });

  const rowsOf = async () => {
    const accrual = await getCommissionAccrual(anchor, { repId });
    return accrual.rows.filter((r) => r.repId === repId);
  };

  it("ciro primi net mal bedelinden hesaplanıyor, iptal sayılmıyor", async () => {
    const rows = await rowsOf();
    const revenue = rows.find((r) => r.planId === revenuePlanId);
    // 100.000 net (KDV'li 120.000 değil), iptal edilen 500.000 yok.
    expect(revenue).toMatchObject({ baseAmount: "100000.00", amount: "2000.00" });
  });

  it("başka plasiyerin carisi primine girmiyor", async () => {
    const rows = await rowsOf();
    const revenue = rows.find((r) => r.planId === revenuePlanId);
    // Öbür carinin 900.000'i toplamda görünseydi taban 1.000.000 olurdu.
    expect(revenue?.baseAmount).toBe("100000.00");
  });

  it("tahsilat primi, kaydı admin girse de portföyün plasiyerine yazılıyor", async () => {
    const rows = await rowsOf();
    const collection = rows.find((r) => r.planId === collectionPlanId);
    expect(collection).toMatchObject({ baseAmount: "40000.00", amount: "2000.00" });
  });

  it("hedef yokken çarpan uygulanmıyor", async () => {
    const rows = await rowsOf();
    const collection = rows.find((r) => r.planId === collectionPlanId);
    expect(collection).toMatchObject({
      target: null,
      targetMet: false,
      effectiveRate: "5.00",
    });
  });

  it("çarpan **ciro** hedefine bakıyor, tahsilat tabanlı planda bile", async () => {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
    await prisma.salesTarget.create({
      data: {
        salesRepId: repId,
        metric: "REVENUE",
        period: "MONTHLY",
        periodStart: start,
        // Ciro 100.000, tahsilat 40.000. Hedef 60.000: ciro tutuyor, tahsilat
        // tutmuyor. Çarpan yine de uygulanmalı — koşul satış hedefi.
        targetValue: 60_000,
        createdById: adminId,
      },
    });

    const rows = await rowsOf();
    const collection = rows.find((r) => r.planId === collectionPlanId);
    expect(collection).toMatchObject({
      targetMet: true,
      effectiveRate: "10.00",
      amount: "4000.00",
    });
  });

  it("eşiğin altındaki taban prim doğurmuyor", async () => {
    const id = (
      await saveCommissionPlan({
        name: `Eşikli ${TAG}`,
        base: "REVENUE",
        rate: 10,
        period: "MONTHLY",
        minBase: 1_000_000,
        repIds: [repId],
      })
    ).id;

    const accrual = await getCommissionAccrual(anchor, { repId });
    const row = accrual.rows.find((r) => r.planId === id);
    expect(row).toMatchObject({ belowMinimum: true, amount: "0.00" });

    await prisma.commissionPlan.delete({ where: { id } });
  });

  it("plan yalnızca plasiyere atanabiliyor", async () => {
    await expect(
      saveCommissionPlan({
        name: `Hatalı ${TAG}`,
        base: "REVENUE",
        rate: 1,
        period: "MONTHLY",
        repIds: [adminId],
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMISSION" });
  });

  it("hedefi tutturmak primi düşüremiyor", async () => {
    await expect(
      saveCommissionPlan({
        name: `Ters çarpan ${TAG}`,
        base: "REVENUE",
        rate: 1,
        period: "MONTHLY",
        targetMultiplier: 0.5,
        repIds: [repId],
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMISSION" });
  });
});
