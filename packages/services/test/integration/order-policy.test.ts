import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import { quoteOrder } from "../../src/order-quote";
import { despatchPromise, saveOrderPolicy } from "../../src/order-policy";

// Sipariş kabul kuralları gerçek veritabanına karşı.
//
// Ayar tablosu **tek satır** ve bu paket onu değiştiriyor: aynı veritabanında
// koşan diğer paketleri etkilememesi için her testten sonra eski hâline
// döndürülüyor (`afterAll`), ve eşikler bu paketin kendi ürününe göre
// seçiliyor.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `pol${Date.now()}`;

let groupId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let companyId: string;
let exemptCompanyId: string;
let buyerId: string;
let adminId: string;
/** Paketten önceki kural — sonunda aynen geri yazılıyor. */
let previous: {
  minOrderAmount: number;
  minOrderCases: number;
  cutoffHour: number | null;
  shipsOnSaturday: boolean;
} | null = null;

suite("sipariş kabul kuralları", () => {
  beforeAll(async () => {
    const before = await prisma.orderPolicy.findUnique({
      where: { id: "singleton" },
    });
    previous = before
      ? {
          minOrderAmount: Number(before.minOrderAmount),
          minOrderCases: before.minOrderCases,
          cutoffHour: before.cutoffHour,
          shipsOnSaturday: before.shipsOnSaturday,
        }
      : null;

    const group = await prisma.customerGroup.create({
      data: { name: `Grup ${TAG}` },
    });
    groupId = group.id;

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` },
    });
    categoryId = category.id;

    const company = await prisma.company.create({
      data: {
        name: `Asgari ${TAG}`,
        creditLimit: 100_000_000,
        customerGroupId: groupId,
      },
    });
    companyId = company.id;

    // Sözleşmeyle muaf: kolon 0, yani "genel kural" değil "bu firmaya asgari
    // uygulanmıyor". İkisinin ayrı olduğunu sınayan testin öznesi.
    const exempt = await prisma.company.create({
      data: {
        name: `Muaf ${TAG}`,
        creditLimit: 100_000_000,
        customerGroupId: groupId,
        minOrderAmount: 0,
      },
    });
    exemptCompanyId = exempt.id;

    const buyer = await prisma.user.create({
      data: {
        email: `buyer-${TAG}@test.local`,
        name: "Asgari Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Asgari Admin",
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
        variants: {
          create: [
            { sku: `SKU-${TAG}`, unitsPerCase: 10, moqUnits: 1, stock: 1_000_000 },
          ],
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
    const companies = [companyId, exemptCompanyId];
    const orders = await prisma.order.findMany({
      where: { companyId: { in: companies } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.transaction.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.stockMovement.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderStatusHistory.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });

    // Kuralı paketten önceki hâline döndür: tek satır, diğer paketler de onu
    // okuyor.
    if (previous) await saveOrderPolicy(previous, adminId);
    else await prisma.orderPolicy.deleteMany({ where: { id: "singleton" } });
    await prisma.$disconnect();
  });

  const items = (quantity: number) => [{ variantId, quantity }];
  // Fonksiyon, sabit değil: `describe` gövdesi `beforeAll`dan **önce**
  // çalışıyor ve orada okunan kimlikler henüz `undefined`.
  const buyerCtx = () => ({
    createdById: buyerId,
    createdByRole: "COMPANY_ADMIN" as const,
  });
  const sellerCtx = () => ({
    createdById: adminId,
    createdByRole: "SUPER_ADMIN" as const,
  });

  // ── asgari tutar ─────────────────────────────────────────────────────────

  it("eşiğin altındaki sepeti alıcıya reddediyor, eksiği rakamla söylüyor", async () => {
    await saveOrderPolicy(
      { minOrderAmount: 5000, minOrderCases: 0, cutoffHour: null, shipsOnSaturday: false },
      adminId,
    );

    // 10 × 100 = 1.000 net — eşiğin 4.000 altında.
    await expect(
      createOrder({ companyId, paymentMethod: "OPEN_ACCOUNT", items: items(10) }, buyerCtx()),
    ).rejects.toMatchObject({
      code: "BELOW_MINIMUM_ORDER",
      // Mesaj eksiği taşıyor: "asgari altında" diyen bir hata, müşteriyi
      // sepete ne ekleyeceğini bilmeden bırakır.
      message: expect.stringContaining("4000.00"),
    });
  });

  it("aynı sepeti satıcı geçirebiliyor", async () => {
    const result = await createOrder(
      { companyId, paymentMethod: "OPEN_ACCOUNT", items: items(10) },
      sellerCtx(),
    );
    expect(result.status).toBe("CONFIRMED");
  });

  it("teklif eksiği hesaplıyor ama fırlatmıyor — sepet rakamı gösterebilsin", async () => {
    const quote = await quoteOrder({
      companyId,
      paymentMethod: "OPEN_ACCOUNT",
      items: items(10),
    });
    expect(quote.minimum.ok).toBe(false);
    expect(quote.minimum.amountShortfall).toBe("4000.00");
    expect(quote.minimum.requiredAmount).toBe("5000.00");
  });

  it("eşiği geçen sepet alıcıya da açık", async () => {
    const result = await createOrder(
      { companyId, paymentMethod: "OPEN_ACCOUNT", items: items(60) },
      buyerCtx(),
    );
    expect(result.status).toBe("CONFIRMED");
  });

  it("firma kolonu 0 ise muaf — genel eşik yükselse de etkilenmiyor", async () => {
    const quote = await quoteOrder({
      companyId: exemptCompanyId,
      paymentMethod: "OPEN_ACCOUNT",
      items: items(10),
    });
    expect(quote.minimum.requiredAmount).toBe("0.00");
    expect(quote.minimum.ok).toBe(true);
  });

  // ── asgari koli ──────────────────────────────────────────────────────────

  it("koli eşiği tutardan bağımsız kapı — ikisi de gerekiyor", async () => {
    await saveOrderPolicy(
      { minOrderAmount: 0, minOrderCases: 5, cutoffHour: null, shipsOnSaturday: false },
      adminId,
    );

    // 20 adet = 2 koli (kolide 10), eşik 5.
    const quote = await quoteOrder({
      companyId,
      paymentMethod: "OPEN_ACCOUNT",
      items: items(20),
    });
    expect(quote.minimum.cases).toBe(2);
    expect(quote.minimum.casesShortfall).toBe(3);
    expect(quote.minimum.ok).toBe(false);

    await expect(
      createOrder({ companyId, paymentMethod: "OPEN_ACCOUNT", items: items(20) }, buyerCtx()),
    ).rejects.toMatchObject({ code: "BELOW_MINIMUM_ORDER" });
  });

  it("kanal sunucudan yazılıyor ve varsayılanı web", async () => {
    await saveOrderPolicy(
      { minOrderAmount: 0, minOrderCases: 0, cutoffHour: null, shipsOnSaturday: false },
      adminId,
    );

    const web = await createOrder(
      { companyId, paymentMethod: "OPEN_ACCOUNT", items: items(10) },
      buyerCtx(),
    );
    const mobile = await createOrder(
      { companyId, paymentMethod: "OPEN_ACCOUNT", items: items(10) },
      { ...buyerCtx(), source: "MOBILE" },
    );

    const rows = await prisma.order.findMany({
      where: { id: { in: [web.orderId, mobile.orderId] } },
      select: { id: true, source: true },
    });
    expect(rows.find((r) => r.id === web.orderId)?.source).toBe("WEB");
    expect(rows.find((r) => r.id === mobile.orderId)?.source).toBe("MOBILE");
  });
});

// Kesim saati saf bir hesap — veritabanı istemiyor, tarihler elle veriliyor.
describe("sevkiyat kesim saati", () => {
  // 2026-08-26 Çarşamba, 2026-08-28 Cuma, 2026-08-29 Cumartesi.
  const at = (iso: string) => new Date(iso);

  it("kesim öncesi aynı gün çıkıyor", () => {
    const p = despatchPromise(
      { cutoffHour: 16, shipsOnSaturday: false },
      at("2026-08-26T10:00:00+03:00"),
    );
    expect(p).toMatchObject({ sameDay: true, despatchDate: "2026-08-26" });
  });

  it("kesimden sonra ertesi güne kayıyor", () => {
    const p = despatchPromise(
      { cutoffHour: 16, shipsOnSaturday: false },
      at("2026-08-26T17:00:00+03:00"),
    );
    expect(p).toMatchObject({ sameDay: false, despatchDate: "2026-08-27" });
  });

  it("cuma akşamı pazartesiye atlıyor — cumartesi kapalıyken", () => {
    const p = despatchPromise(
      { cutoffHour: 16, shipsOnSaturday: false },
      at("2026-08-28T20:00:00+03:00"),
    );
    expect(p.despatchDate).toBe("2026-08-31");
  });

  it("cumartesi açıksa cuma akşamı cumartesiye çıkıyor", () => {
    const p = despatchPromise(
      { cutoffHour: 16, shipsOnSaturday: true },
      at("2026-08-28T20:00:00+03:00"),
    );
    expect(p.despatchDate).toBe("2026-08-29");
  });

  it("pazar her hâlükârda kapalı", () => {
    const p = despatchPromise(
      { cutoffHour: 16, shipsOnSaturday: true },
      at("2026-08-30T09:00:00+03:00"),
    );
    expect(p.despatchDate).toBe("2026-08-31");
  });

  it("kesim saati yoksa söz de yok", () => {
    const p = despatchPromise(
      { cutoffHour: null, shipsOnSaturday: false },
      at("2026-08-30T23:00:00+03:00"),
    );
    expect(p).toMatchObject({ cutoffHour: null, sameDay: true });
  });
});
