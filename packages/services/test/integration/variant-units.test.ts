import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@repo/database";
import { getCart, upsertCartItem } from "../../src/cart";
import { getCatalogProduct, listCatalog } from "../../src/catalog";
import { ingestPrices, ingestUnits } from "../../src/erp-ingest";
import { createInvoice } from "../../src/invoice";
import { createOrder } from "../../src/order";
import { getOrderDetail } from "../../src/order-lifecycle";
import { resolvePrice, type PriceRow } from "../../src/pricing";
import { createShipment } from "../../src/shipment";
import {
  createVariantUnit,
  deleteVariantUnit,
  findByBarcode,
  updateVariantUnit,
} from "../../src/variant-unit";
import { useOwnDefaultSeries, type SeriesFixture } from "./series-fixture";

// Çoklu birim (F2): adet, koli, palet.
//
// Kanıtlanması gerekenler: miktar ve stok taban birimde kalıyor; paketin kendi
// fiyatı paket üzerinden kuruşuyla tutuyor — kısmi faturada bile ("koli
// 100 ₺" taban birime 8,333333 ₺ iner, 12 adetlik fatura yine 100,00 ₺);
// paket tam sayı; barkod kalemler ve paketler arasında tekil; gruba konuşulmuş
// adet fiyatı herkese açık koli fiyatına ezilmiyor.

const D = (n: number | string) => new Prisma.Decimal(n);

function row(over: Partial<PriceRow> & { price: number }): PriceRow {
  return {
    customerGroupId: null,
    minQuantity: 1,
    unitId: null,
    ...over,
    price: D(over.price),
  };
}

describe("paket fiyatı (saf hesap)", () => {
  const base = {
    customerGroupId: null,
    productId: "p",
    categoryId: "c",
    discounts: [],
  };
  const koli = { id: "koli", factor: D(12) };

  it("paketin kendi fiyatı paket başına; birim fiyat taban birime altı ondalıkla iniyor", () => {
    const r = resolvePrice({
      ...base,
      prices: [row({ price: 9 }), row({ price: 100, unitId: "koli" })],
      quantity: 24,
      unit: koli,
    });
    expect(r.package?.unitPrice.toFixed(2)).toBe("100.00");
    expect(r.package?.count).toBe(2);
    expect(r.unitPrice.toString()).toBe("8.333333");
    expect(r.lineNet.toFixed(2)).toBe("200.00");
  });

  it("paketin fiyatı yoksa taban fiyat × çarpan", () => {
    const r = resolvePrice({
      ...base,
      prices: [row({ price: 9 })],
      quantity: 12,
      unit: koli,
    });
    expect(r.package?.unitPrice.toFixed(2)).toBe("108.00");
    expect(r.unitPrice.toFixed(2)).toBe("9.00");
  });

  it("yüzde iskonto paket üzerinden kuruşuyla; FIXED iskonto çarpanla büyüyor", () => {
    const percent = resolvePrice({
      ...base,
      discounts: [
        { categoryId: null, productId: "p", discountType: "PERCENTAGE", value: D(10) },
      ],
      prices: [row({ price: 100, unitId: "koli" })],
      quantity: 36,
      unit: koli,
    });
    expect(percent.package?.netUnitPrice.toFixed(2)).toBe("90.00");
    expect(percent.lineNet.toFixed(2)).toBe("270.00");

    const fixed = resolvePrice({
      ...base,
      discounts: [{ categoryId: null, productId: "p", discountType: "FIXED", value: D(0.5) }],
      prices: [row({ price: 100, unitId: "koli" })],
      quantity: 12,
      unit: koli,
    });
    // Taban birim başına 0,50 ₺ → koli başına 6,00 ₺.
    expect(fixed.package?.discountPerUnit.toFixed(2)).toBe("6.00");
  });

  it("gruba konuşulmuş adet fiyatı herkese açık koli fiyatını yener", () => {
    const r = resolvePrice({
      ...base,
      customerGroupId: "bayi",
      prices: [
        row({ price: 8, customerGroupId: "bayi" }),
        row({ price: 100, unitId: "koli" }),
      ],
      quantity: 12,
      unit: koli,
    });
    expect(r.package?.unitPrice.toFixed(2)).toBe("96.00");
  });

  it("adetle alan satır koli fiyatını görmüyor", () => {
    const r = resolvePrice({
      ...base,
      prices: [row({ price: 9 }), row({ price: 1, unitId: "koli" })],
      quantity: 12,
    });
    expect(r.unitPrice.toFixed(2)).toBe("9.00");
    expect(r.package).toBeNull();
  });

  it("paket kademesi paket sayısıyla okunuyor", () => {
    const prices = [
      row({ price: 100, unitId: "koli" }),
      row({ price: 90, unitId: "koli", minQuantity: 5 }),
    ];
    expect(resolvePrice({ ...base, prices, quantity: 48, unit: koli }).package?.unitPrice.toFixed(2)).toBe("100.00");
    expect(resolvePrice({ ...base, prices, quantity: 60, unit: koli }).package?.unitPrice.toFixed(2)).toBe("90.00");
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `birim${Date.now()}`;
const ADMIN = { userId: "", role: "SUPER_ADMIN" as const };

let groupId: string;
let categoryId: string;
let companyId: string;
let buyerId: string;
let adminId: string;
let productId: string;
let variantId: string;
let otherVariantId: string;
let koliId: string;
let paletId: string;
let series: SeriesFixture;

suite("çoklu birim integration", () => {
  beforeAll(async () => {
    series = await useOwnDefaultSeries(TAG);

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

    const buyer = await prisma.user.create({
      data: {
        email: `buyer-${TAG}@test.local`,
        name: "Birim Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;
    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Birim Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;
    ADMIN.userId = adminId;

    const product = await prisma.product.create({
      data: {
        name: `Su ${TAG}`,
        slug: `su-${TAG}`,
        vatRate: 0,
        categoryId,
        variants: {
          create: [
            {
              sku: `SU-${TAG}`,
              barcode: `869${Date.now()}`.slice(0, 13),
              unit: "ADET",
              unitsPerCase: 1,
              moqUnits: 1,
              stock: 1000,
            },
            { sku: `DIGER-${TAG}`, unit: "ADET", unitsPerCase: 1, moqUnits: 1, stock: 10 },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants.find((v) => v.sku === `SU-${TAG}`)!.id;
    otherVariantId = product.variants.find((v) => v.sku === `DIGER-${TAG}`)!.id;

    // Taban liste fiyatı 9 ₺ (grupsuz). Koli 100 ₺ kendi fiyatıyla, palet
    // fiyatsız (taban × 120).
    await prisma.price.create({ data: { variantId, minQuantity: 1, price: 9 } });
    await prisma.price.create({ data: { variantId: otherVariantId, minQuantity: 1, price: 9 } });
    koliId = (
      await createVariantUnit(variantId, {
        name: "koli",
        factor: 12,
        barcode: `KOLI-${TAG}`,
        price: 100,
      })
    ).id;
    paletId = (await createVariantUnit(variantId, { name: "Palet", factor: 120 })).id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const orders = await prisma.order.findMany({ where: { companyId }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    const variantIds = [variantId, otherVariantId];
    await prisma.stockMovement.updateMany({
      where: { variantId: { in: variantIds } },
      data: { reversalOfId: null, counterpartId: null },
    });
    await prisma.stockMovement.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.cart.deleteMany({ where: { companyId } });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await series.restore();
    await prisma.price.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  const place = (quantity: number, unitId: string | null) =>
    createOrder(
      {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity, unitId }],
      },
      { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
    );

  it("birim adı büyük harfe çevriliyor; taban ve paket liste fiyatı yan yana duruyor", async () => {
    const koli = await prisma.variantUnit.findUniqueOrThrow({ where: { id: koliId } });
    expect(koli.name).toBe("KOLİ");
    // Eski kısmi indeks (variantId, minQuantity) grupsuz satırda ikinciyi
    // reddederdi; paket fiyatı artık ayrı indeksle tekil.
    const rows = await prisma.price.findMany({ where: { variantId, customerGroupId: null } });
    expect(rows).toHaveLength(2);
    await expect(
      prisma.price.create({ data: { variantId, unitId: koliId, minQuantity: 1, price: 1 } }),
    ).rejects.toThrow();
  });

  it("2 koli: stok 24 düşüyor, satır KOLİ künyesini ve 200,00 ₺'yi taşıyor", async () => {
    const before = Number(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    );
    const order = await place(24, koliId);

    const after = Number(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    );
    expect(after).toBe(before - 24);

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.orderId } });
    expect(Number(item.quantity)).toBe(24);
    expect(item.unitName).toBe("KOLİ");
    expect(Number(item.unitMultiplier)).toBe(12);
    expect(item.unitPrice.toString()).toBe("8.333333");
    expect(item.lineTotal.toFixed(2)).toBe("200.00");

    const detail = await getOrderDetail(order.orderId, ADMIN);
    expect(detail.items[0]?.unit).toEqual({
      name: "KOLİ",
      factor: 12,
      count: 2,
      unitPrice: "100.00",
    });
  });

  it("kısmi sevk ve fatura: 1 koli 100,00 ₺, kuruş kaybolmuyor", async () => {
    const order = await place(24, koliId);
    const line = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.orderId },
      select: { id: true },
    });

    const first = await createShipment(
      order.orderId,
      { items: [{ orderItemId: line.id, quantity: 12 }] },
      ADMIN,
    );
    const shipment = await prisma.shipment.findFirstOrThrow({
      where: { documentNumber: first.documentNumber },
      select: { id: true },
    });
    const invoice = await createInvoice(order.orderId, { shipmentIds: [shipment.id] }, ADMIN);
    // 12 × 8,333333 = 99,999996 → 100,00.
    expect(invoice.grandTotal).toBe("100.00");

    await createShipment(order.orderId, { items: [{ orderItemId: line.id, quantity: 12 }] }, ADMIN);
    const rest = await createInvoice(order.orderId, {}, ADMIN);
    expect(rest.grandTotal).toBe("100.00");
  });

  it("fiyatsız palet taban × çarpandan fiyatlanıyor", async () => {
    const order = await place(120, paletId);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.orderId } });
    expect(item.lineTotal.toFixed(2)).toBe("1080.00");
    expect(item.unitName).toBe("PALET");
  });

  it("tam paket değilse reddediliyor", async () => {
    await expect(place(30, koliId)).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
  });

  it("başka kalemin birimi ve pasif birim kabul edilmiyor", async () => {
    await expect(
      createOrder(
        {
          companyId,
          paymentMethod: "OPEN_ACCOUNT",
          items: [{ variantId: otherVariantId, quantity: 12, unitId: koliId }],
        },
        { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
      ),
    ).rejects.toMatchObject({ code: "UNIT_NOT_FOUND" });

    await updateVariantUnit(paletId, { isActive: false });
    try {
      await expect(place(120, paletId)).rejects.toMatchObject({ code: "UNIT_NOT_FOUND" });
    } finally {
      await updateVariantUnit(paletId, { isActive: true });
    }
  });

  it("barkod kalemler ve paketler arasında tekil; okutma paketi buluyor", async () => {
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    await expect(
      createVariantUnit(otherVariantId, { name: "KOLİ", factor: 6, barcode: variant.barcode! }),
    ).rejects.toMatchObject({ code: "DUPLICATE_BARCODE" });
    await expect(
      createVariantUnit(variantId, { name: "Koli", factor: 6 }),
    ).rejects.toMatchObject({ code: "DUPLICATE_UNIT" });

    expect(await findByBarcode(`KOLI-${TAG}`)).toEqual({ variantId, unitId: koliId });
    expect(await findByBarcode(variant.barcode!)).toEqual({ variantId, unitId: null });
  });

  it("katalog paketleri bir paketin fiyatıyla döndürüyor; koli barkoduyla aranıyor", async () => {
    const product = await getCatalogProduct(productId, companyId);
    const v = product!.variants.find((x) => x.id === variantId)!;
    expect(v.units.map((u) => [u.name, u.factor, u.netUnitPrice])).toEqual([
      ["KOLİ", 12, "100.00"],
      ["PALET", 120, "1080.00"],
    ]);

    const found = await listCatalog({ companyId, search: `KOLI-${TAG}` });
    expect(found.map((p) => p.id)).toEqual([productId]);
  });

  it("sepet: koli satırı paket fiyatını taşıyor; başka birim eklenince taban birime düşüyor", async () => {
    let cart = await upsertCartItem(
      { companyId, variantId, quantity: 24, unitId: koliId },
      buyerId,
    );
    let line = cart.lines.find((l) => l.variantId === variantId)!;
    expect(line.unitId).toBe(koliId);
    expect(line.packageNetPrice).toBe("100.00");
    expect(line.units.map((u) => u.name)).toEqual(["KOLİ", "PALET"]);

    await expect(
      upsertCartItem({ companyId, variantId, quantity: 30, unitId: koliId }, buyerId),
    ).rejects.toMatchObject({ code: "INVALID_QUANTITY" });

    cart = await upsertCartItem(
      { companyId, variantId, quantity: 5, increment: true },
      buyerId,
    );
    line = cart.lines.find((l) => l.variantId === variantId)!;
    expect(line.quantity).toBe(29);
    expect(line.unitId).toBeNull();

    const again = await getCart(companyId, buyerId);
    expect(again.lines.find((l) => l.variantId === variantId)!.unitId).toBeNull();
  });

  it("birim silinince geçmiş sipariş künyesini koruyor", async () => {
    const tmp = await createVariantUnit(variantId, { name: "DESTE", factor: 6 });
    const order = await place(12, tmp.id);
    await deleteVariantUnit(tmp.id);

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.orderId } });
    expect(item.unitId).toBeNull();
    expect(item.unitName).toBe("DESTE");
    expect(Number(item.unitMultiplier)).toBe(6);
  });

  it("ERP birimleri: elle açılmış KOLİ'ye bağlanıyor, taban birim ve çakışan barkod ayıklanıyor", async () => {
    const stockCode = `STK-${TAG}`;
    await prisma.productVariant.update({ where: { id: variantId }, data: { externalCode: stockCode } });
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const rows = [
      { code: stockCode, unitCode: "B-1", name: "koli", factor: 12 },
      { code: stockCode, unitCode: "B-2", name: "Kutu", factor: 6, barcode: variant.barcode },
      { code: stockCode, unitCode: "B-3", name: "ADET", factor: 1 },
      { code: `YOK-${TAG}`, unitCode: "B-4", name: "KOLİ", factor: 24 },
    ];

    const first = await ingestUnits(rows, null);
    expect(first.applied).toBe(2);
    // Taban birim, bilinmeyen kart ve barkodsuz yazılan kutunun notu.
    expect(first.skipped).toBe(3);
    expect(first.status).toBe("PARTIAL");

    const koli = await prisma.variantUnit.findUniqueOrThrow({ where: { id: koliId } });
    expect(koli.externalCode).toBe("B-1");
    const kutu = await prisma.variantUnit.findFirstOrThrow({
      where: { variantId, externalCode: "B-2" },
    });
    expect(kutu.name).toBe("KUTU");
    expect(kutu.barcode).toBeNull();

    // Tekrar gönderim yeni satır açmıyor.
    await ingestUnits(rows, null);
    expect(
      await prisma.variantUnit.count({ where: { variantId, externalCode: { not: null } } }),
    ).toBe(2);

    // Paket fiyatı birim koduyla geliyor; bilinmeyen birim kodu ayıklanıyor.
    const prices = await ingestPrices(
      [
        { code: stockCode, price: 95, unitCode: "B-1" },
        { code: stockCode, price: 50, unitCode: "B-9" },
      ],
      null,
    );
    expect(prices.applied).toBe(1);
    expect(prices.skipped).toBe(1);
    const koliPrice = await prisma.price.findFirstOrThrow({
      where: { variantId, unitId: koliId, customerGroupId: null, minQuantity: 1 },
    });
    expect(koliPrice.price.toFixed(2)).toBe("95.00");
    // Taban fiyat yerinde.
    const basePrice = await prisma.price.findFirstOrThrow({
      where: { variantId, unitId: null, customerGroupId: null, minQuantity: 1 },
    });
    expect(basePrice.price.toFixed(2)).toBe("9.00");
  });
});
