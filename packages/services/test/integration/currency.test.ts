import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { listCatalog } from "../../src/catalog";
import { getCurrentRates, recordExchangeRate } from "../../src/exchange-rate";
import { createOrder } from "../../src/order";
import { quoteOrder } from "../../src/order-quote";

// Çoklu para birimi.
//
// Kanıtlanacak iddia: **defter TL, kur siparişte donar.** Dolarla listelenen
// ürün TL'ye çevrilerek fiyatlanıyor, çevrimde kullanılan kur sipariş satırına
// yazılıyor, ve kur sonradan değiştiğinde eski siparişin tutarı değişmiyor.
//
// Bir de "olmadığında ne oluyor": kuru girilmemiş para birimi fiyatlamayı
// durdurmalı, sessizce 1 kabul etmemeli — 100 dolarlık malı 100 liraya satmak
// en geç fark edilen hata türü.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `fx${Date.now()}`;

let groupId: string;
let categoryId: string;
let companyId: string;
let buyerId: string;
let adminId: string;
let usdVariantId: string;
let tryVariantId: string;
let gbpVariantId: string;
let productId: string;

/**
 * Testin süresi boyunca kenara alınan gerçek kur satırları.
 *
 * Bu takım "GBP'nin kuru yok" ve "geçerli USD kuru 34,50" diyor; ikisi de
 * tablonun tamamı hakkında iddia. TCMB işi devreye girdiğinden beri geliştirme
 * veritabanında güncel kurlar oluşabiliyor ve o satırlar testin kendi
 * satırlarını tarih olarak geçiyordu. Tablo boşaltılıp sonunda geri konuyor —
 * silmek değil, ödünç almak.
 */
let borrowedRates: Array<{
  id: string;
  currency: string;
  rate: unknown;
  validFrom: Date;
  source: string;
  createdById: string | null;
  createdAt: Date;
}> = [];

suite("çoklu para birimi integration", () => {
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

    buyerId = (
      await prisma.user.create({
        data: {
          email: `buyer-${TAG}@test.local`,
          name: "FX Alıcı",
          passwordHash: "x",
          role: "COMPANY_ADMIN",
          companyId,
        },
      })
    ).id;

    adminId = (
      await prisma.user.create({
        data: {
          email: `admin-${TAG}@test.local`,
          name: "FX Admin",
          passwordHash: "x",
          role: "SUPER_ADMIN",
        },
      })
    ).id;

    const product = await prisma.product.create({
      data: {
        name: `Ürün ${TAG}`,
        slug: `urun-${TAG}`,
        vatRate: 0,
        categoryId,
        variants: {
          create: [
            { sku: `USD-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 1000 },
            { sku: `TRY-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 1000 },
            { sku: `GBP-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 1000 },
          ],
        },
      },
      include: { variants: { orderBy: { sku: "asc" } } },
    });
    productId = product.id;
    gbpVariantId = product.variants.find((v) => v.sku.startsWith("GBP"))!.id;
    tryVariantId = product.variants.find((v) => v.sku.startsWith("TRY"))!.id;
    usdVariantId = product.variants.find((v) => v.sku.startsWith("USD"))!.id;

    await prisma.price.createMany({
      data: [
        { variantId: usdVariantId, customerGroupId: groupId, minQuantity: 1, price: 100, currency: "USD" },
        { variantId: tryVariantId, customerGroupId: groupId, minQuantity: 1, price: 100, currency: "TRY" },
        // GBP'nin kuru bilerek hiç girilmiyor.
        { variantId: gbpVariantId, customerGroupId: groupId, minQuantity: 1, price: 100, currency: "GBP" },
      ],
    });

    borrowedRates = await prisma.exchangeRate.findMany();
    await prisma.exchangeRate.deleteMany({});

    await recordExchangeRate(
      { currency: "USD", rate: 34.5, validFrom: new Date("2026-01-01") },
      adminId,
    );
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { companyId },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.price.deleteMany({
      where: { variantId: { in: [usdVariantId, tryVariantId, gbpVariantId] } },
    });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    // Kurlar kullanıcıdan ÖNCE siliniyor: `createdById` ilişkisi SET NULL, yani
    // kullanıcı gidince satırın sahibi kaybolur ve sonraki silme hiçbir şeyle
    // eşleşmez — takım kendi kurunu veritabanında bırakır.
    await prisma.exchangeRate.deleteMany({ where: { createdById: adminId } });
    // Ödünç alınan satırlar geri konuyor. `createMany` + `skipDuplicates`:
    // testin kendi yazdığı bir satırla aynı (para birimi, tarih) çiftine denk
    // gelirse takım burada patlamak yerine devam etmeli.
    if (borrowedRates.length > 0) {
      await prisma.exchangeRate.createMany({
        data: borrowedRates as never,
        skipDuplicates: true,
      });
    }
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  describe("çevrim", () => {
    it("dolarla listelenen ürün TL olarak fiyatlanır", async () => {
      const quote = await quoteOrder({
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId: usdVariantId, quantity: 1 }],
      });
      // 100 USD × 34,50 = 3.450,00 TL
      expect(quote.lines[0]!.unitPrice).toBe("3450.00");
      expect(quote.lines[0]!.listCurrency).toBe("USD");
      expect(quote.lines[0]!.listUnitPrice).toBe("100.00");
    });

    it("TL ürün çevrimden geçmez", async () => {
      const quote = await quoteOrder({
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId: tryVariantId, quantity: 1 }],
      });
      expect(quote.lines[0]!.unitPrice).toBe("100.00");
      expect(quote.lines[0]!.listCurrency).toBe("TRY");
      expect(Number(quote.lines[0]!.exchangeRate)).toBe(1);
    });

    it("kuru girilmemiş para birimi fiyatlamayı durdurur", async () => {
      // Sessizce 1 kabul etmek, 100 sterlinlik malı 100 liraya satmaktı.
      await expect(
        quoteOrder({
          companyId,
          paymentMethod: "OPEN_ACCOUNT",
          items: [{ variantId: gbpVariantId, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: "MISSING_EXCHANGE_RATE" });
    });

    it("katalogda fiyat TL, künyede orijinal para birimi durur", async () => {
      const products = await listCatalog({ companyId });
      const usd = products
        .flatMap((p) => p.variants)
        .find((v) => v.id === usdVariantId);
      expect(usd?.netUnitPrice).toBe("3450.00");
      expect(usd?.listCurrency).toBe("USD");
      expect(usd?.listUnitPrice).toBe("100.00");
    });
  });

  describe("kur siparişte donar", () => {
    it("sipariş satırı kendi kurunu taşır ve kur değişince değişmez", async () => {
      const order = await createOrder(
        {
          companyId,
          paymentMethod: "OPEN_ACCOUNT",
          items: [{ variantId: usdVariantId, quantity: 2 }],
        },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      );

      const before = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.orderId },
        select: {
          unitPrice: true,
          listCurrency: true,
          exchangeRate: true,
          listUnitPrice: true,
        },
      });
      expect(before.listCurrency).toBe("USD");
      expect(Number(before.exchangeRate)).toBeCloseTo(34.5, 4);
      expect(Number(before.unitPrice)).toBeCloseTo(3450, 2);

      // Kur yükseliyor.
      await recordExchangeRate({ currency: "USD", rate: 40 }, adminId);

      const after = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.orderId },
        select: { unitPrice: true, exchangeRate: true },
      });
      // Dünkü sipariş dünkü kurdan kalır: defter TL ve tutar zaten yazılmış.
      expect(Number(after.unitPrice)).toBeCloseTo(3450, 2);
      expect(Number(after.exchangeRate)).toBeCloseTo(34.5, 4);

      // Yeni sipariş yeni kurdan.
      const next = await quoteOrder({
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId: usdVariantId, quantity: 1 }],
      });
      expect(next.lines[0]!.unitPrice).toBe("4000.00");
    });
  });

  describe("kur listesi", () => {
    it("eksik kuru işaretler", async () => {
      const rows = await getCurrentRates();
      expect(rows.find((r) => r.currency === "USD")?.missing).toBe(false);
      expect(rows.find((r) => r.currency === "GBP")?.missing).toBe(true);
    });
  });
});
