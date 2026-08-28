import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  applyDuePriceChanges,
  cancelScheduledPriceChange,
  listScheduledPriceChanges,
  schedulePriceChange,
} from "../../src/price-schedule";

// Zamanlı fiyat değişimi.
//
// Sınanan asıl şey, kuyruğun **fiyat listesine** doğru yansıması: bekleyen
// satır fiyatı değiştirmiyor, uygulanan satır değiştiriyor, ve uygulanmış satır
// eski fiyatı taşıyor.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `sch${Date.now()}`;

let groupId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let adminId: string;

/** Bir varyantın grup fiyatı — doğrudan tablodan. */
async function priceOf(): Promise<string | null> {
  const row = await prisma.price.findFirst({
    where: { variantId, customerGroupId: groupId, minQuantity: 1 },
    select: { price: true },
  });
  return row?.price.toFixed(2) ?? null;
}

suite("zamanlı fiyat değişimi", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({
      data: { name: `Grup ${TAG}` },
    });
    groupId = group.id;

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` },
    });
    categoryId = category.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Zam Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

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

    await prisma.price.create({
      data: { variantId, customerGroupId: groupId, minQuantity: 1, price: 100 },
    });
  });

  afterAll(async () => {
    await prisma.scheduledPriceChange.deleteMany({ where: { variantId } });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  const tomorrow = () => new Date(Date.now() + 86_400_000);
  const yesterdayish = () => new Date(Date.now() - 60_000);

  it("geçmiş tarihe fiyat yazılmıyor", async () => {
    await expect(
      schedulePriceChange(
        {
          variantId,
          customerGroupId: groupId,
          minQuantity: 1,
          price: 120,
          effectiveAt: yesterdayish(),
        },
        adminId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_SCHEDULE" });
  });

  it("bekleyen satır fiyatı DEĞİŞTİRMİYOR", async () => {
    await schedulePriceChange(
      {
        variantId,
        customerGroupId: groupId,
        minQuantity: 1,
        price: 120,
        effectiveAt: tomorrow(),
        note: "Eylül zammı",
      },
      adminId,
    );
    expect(await priceOf()).toBe("100.00");

    const pending = await listScheduledPriceChanges();
    const mine = pending.find((r) => r.sku === `SKU-${TAG}`);
    expect(mine).toMatchObject({ price: "120.00", currentPrice: "100.00" });
  });

  it("zamanı gelmemiş satırı iş atlıyor", async () => {
    const result = await applyDuePriceChanges();
    expect(await priceOf()).toBe("100.00");
    // Başka paketlerin satırları da olabilir; kendi satırımızın hâline bakıyoruz.
    expect(result.failed).toBe(0);
  });

  it("zamanı gelince uyguluyor ve eski fiyatı saklıyor", async () => {
    // Yürürlüğü geçmişe çekmek için doğrudan tablodan: servis geçmişe
    // yazdırmıyor ve haklı olarak — burada sınanan şey işin kendisi.
    await prisma.scheduledPriceChange.updateMany({
      where: { variantId, status: "PENDING" },
      data: { effectiveAt: yesterdayish() },
    });

    const result = await applyDuePriceChanges();
    expect(result.failed).toBe(0);
    expect(await priceOf()).toBe("120.00");

    const applied = await listScheduledPriceChanges({ status: "APPLIED" });
    const mine = applied.find((r) => r.sku === `SKU-${TAG}`);
    expect(mine).toMatchObject({
      price: "120.00",
      previousPrice: "100.00",
      status: "APPLIED",
    });
    expect(mine?.appliedAt).not.toBeNull();
  });

  it("iki kez çalışmak bir kez çalışmakla aynı", async () => {
    await prisma.price.updateMany({
      where: { variantId, customerGroupId: groupId, minQuantity: 1 },
      data: { price: 999 },
    });
    // Uygulanmış satır artık PENDING değil: ikinci tur ona dokunmamalı.
    const result = await applyDuePriceChanges();
    expect(result.applied).toBe(0);
    expect(await priceOf()).toBe("999.00");

    await prisma.price.updateMany({
      where: { variantId, customerGroupId: groupId, minQuantity: 1 },
      data: { price: 120 },
    });
  });

  it("olmayan kademeyi açıyor", async () => {
    await schedulePriceChange(
      {
        variantId,
        customerGroupId: groupId,
        // Bu kademe yok: "1 Eylül'den itibaren 100 adet üstü şu fiyat" demek,
        // o kademeyi o gün açmak demek.
        minQuantity: 100,
        price: 90,
        effectiveAt: tomorrow(),
      },
      adminId,
    );
    await prisma.scheduledPriceChange.updateMany({
      where: { variantId, status: "PENDING", minQuantity: 100 },
      data: { effectiveAt: yesterdayish() },
    });

    await applyDuePriceChanges();
    const tier = await prisma.price.findFirst({
      where: { variantId, customerGroupId: groupId, minQuantity: 100 },
      select: { price: true },
    });
    expect(tier?.price.toFixed(2)).toBe("90.00");
  });

  it("iptal edilen satır uygulanmıyor", async () => {
    const { id } = await schedulePriceChange(
      {
        variantId,
        customerGroupId: groupId,
        minQuantity: 1,
        price: 500,
        effectiveAt: tomorrow(),
      },
      adminId,
    );
    await cancelScheduledPriceChange(id);

    await prisma.scheduledPriceChange.updateMany({
      where: { id },
      data: { effectiveAt: yesterdayish() },
    });
    await applyDuePriceChanges();
    expect(await priceOf()).toBe("120.00");
  });

  it("uygulanmış satır iptal edilemiyor", async () => {
    const applied = await prisma.scheduledPriceChange.findFirst({
      where: { variantId, status: "APPLIED" },
      select: { id: true },
    });
    await expect(
      cancelScheduledPriceChange(applied!.id),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
