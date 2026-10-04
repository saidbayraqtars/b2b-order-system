import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { quantityInput } from "@repo/types";
import { upsertCartItem, getCart } from "../../src/cart";
import { createInvoice } from "../../src/invoice";
import { createOrder } from "../../src/order";
import { changeOrderStatus } from "../../src/order-lifecycle";
import { fitsQuantityScale, qtyAdd, qtySub } from "../../src/quantity";
import { createShipment, getOpenLines } from "../../src/shipment";
import {
  applyErpStock,
  listStockMovements,
  recordManualStockMovement,
  recordStockCount,
} from "../../src/stock-ledger";
import { useOwnDefaultSeries, type SeriesFixture } from "./series-fixture";

// Kesirli miktar (F1): kilo ve metre satan kurulum.
//
// Kanıtlanması gereken üç şey var. Kesir hiçbir yolda kırpılmıyor (sipariş,
// sevk, fatura, sayım, ERP). Kısmi sevkler toplandığında satır gerçekten
// kapanıyor — sayı olarak 0,3 + 0,45 + 0,25 bir etmiyor. Ve adet satan kalem
// eskisi gibi tam sayı istiyor: kesirli satış kalem kalem, bilerek açılıyor.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `kesir${Date.now()}`;
const ADMIN = { userId: "", role: "SUPER_ADMIN" as const };

let groupId: string;
let categoryId: string;
let companyId: string;
let buyerId: string;
let adminId: string;
let productId: string;
/** Kilo: üç ondalık. */
let kgId: string;
/** Adet: tam sayı. */
let pieceId: string;
let series: SeriesFixture;

async function stockOf(id: string): Promise<number> {
  const row = await prisma.productVariant.findUniqueOrThrow({
    where: { id },
    select: { stock: true },
  });
  return Number(row.stock);
}

describe("miktar aritmetiği", () => {
  it("toplama ve çıkarma ondalıkta yapılıyor", () => {
    // Sayı olarak 1 - 0.3 - 0.7 = 5.55e-17; satır hiç kapanmazdı.
    expect(qtySub(qtySub(1, 0.3), 0.7)).toBe(0);
    expect(qtyAdd(0.1, 0.2)).toBe(0.3);
  });

  it("ölçek kalemin kaç ondalık alabildiğini söylüyor", () => {
    expect(fitsQuantityScale(2, 0)).toBe(true);
    expect(fitsQuantityScale(1.5, 0)).toBe(false);
    expect(fitsQuantityScale(0.75, 2)).toBe(true);
    expect(fitsQuantityScale(0.125, 2)).toBe(false);
    expect(fitsQuantityScale(0.125, 3)).toBe(true);
  });

  it("şema gürültüyü yuvarlıyor, gerçek dördüncü ondalığı reddediyor", () => {
    const schema = quantityInput();
    expect(schema.parse(0.1 + 0.2)).toBe(0.3);
    expect(schema.parse(12)).toBe(12);
    expect(schema.safeParse(0.0005).success).toBe(false);
    expect(schema.safeParse(0).success).toBe(false);
    expect(quantityInput({ allowZero: true }).parse(0)).toBe(0);
  });
});

suite("kesirli miktar integration", () => {
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
        name: "Kesir Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;
    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Kesir Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;
    ADMIN.userId = adminId;

    const product = await prisma.product.create({
      data: {
        name: `Peynir ${TAG}`,
        slug: `peynir-${TAG}`,
        vatRate: 0,
        categoryId,
        variants: {
          create: [
            {
              sku: `KG-${TAG}`,
              unit: "KG",
              quantityScale: 3,
              unitsPerCase: 1,
              // En az sipariş de ondalık: 0,1 kg.
              moqUnits: 0.1,
              stock: 10,
            },
            { sku: `AD-${TAG}`, unit: "ADET", unitsPerCase: 1, moqUnits: 1, stock: 10 },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    kgId = product.variants.find((v) => v.sku === `KG-${TAG}`)!.id;
    pieceId = product.variants.find((v) => v.sku === `AD-${TAG}`)!.id;

    for (const variantId of [kgId, pieceId]) {
      await prisma.price.create({
        data: { variantId, customerGroupId: groupId, minQuantity: 1, price: 100 },
      });
    }
  });

  afterAll(async () => {
    if (!hasDb) return;
    const orders = await prisma.order.findMany({ where: { companyId }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    const variantIds = [kgId, pieceId];
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

  const place = (variantId: string, quantity: number) =>
    createOrder(
      { companyId, paymentMethod: "OPEN_ACCOUNT", items: [{ variantId, quantity }] },
      { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
    );

  it("0,75 kg'lık sipariş stoktan 0,75 düşüyor, fiyat 0,75 ile çarpılıyor", async () => {
    const before = await stockOf(kgId);
    const order = await place(kgId, 0.75);

    expect(await stockOf(kgId)).toBe(qtySub(before, 0.75));
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.orderId },
    });
    expect(item.quantity.toString()).toBe("0.75");
    expect(item.lineTotal.toFixed(2)).toBe("75.00");

    const [entry] = await listStockMovements({ variantId: kgId, limit: 1 });
    expect(entry?.quantity).toBe(0.75);
    expect(entry?.balanceAfter).toBe(qtySub(before, 0.75));
  });

  it("ondalık en az sipariş miktarı uygulanıyor", async () => {
    await expect(place(kgId, 0.05)).rejects.toMatchObject({ code: "MOQ_NOT_MET" });
  });

  it("adet satan kalemde 1,5 reddediliyor", async () => {
    await expect(place(pieceId, 1.5)).rejects.toMatchObject({
      code: "INVALID_QUANTITY",
    });
  });

  it("kalemin ölçeğinden fazla ondalık reddediliyor", async () => {
    await prisma.productVariant.update({ where: { id: kgId }, data: { quantityScale: 2 } });
    try {
      await expect(place(kgId, 0.125)).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
    } finally {
      await prisma.productVariant.update({ where: { id: kgId }, data: { quantityScale: 3 } });
    }
  });

  it("kısmi sevkler toplanınca satır kapanıyor ve fatura kesir üzerinden kesiliyor", async () => {
    const order = await place(kgId, 1);

    await createShipment(order.orderId, { items: [{ orderItemId: await lineOf(order.orderId), quantity: 0.3 }] }, ADMIN);
    await createShipment(order.orderId, { items: [{ orderItemId: await lineOf(order.orderId), quantity: 0.45 }] }, ADMIN);
    const third = await createShipment(
      order.orderId,
      { items: [{ orderItemId: await lineOf(order.orderId), quantity: 0.25 }] },
      ADMIN,
    );

    // 0,3 + 0,45 + 0,25 sayı olarak 1 etmiyor; ondalıkta ediyor.
    expect(third.orderStatus).toBe("SHIPPED");
    const [line] = await getOpenLines(order.orderId);
    expect(line?.quantityShipped).toBe(1);
    expect(line?.remainingToShip).toBe(0);

    const invoice = await createInvoice(order.orderId, {}, ADMIN);
    expect(invoice.grandTotal).toBe("100.00");
  });

  it("sevk edilen miktar kalanı aşamıyor", async () => {
    const order = await place(kgId, 0.5);
    await expect(
      createShipment(
        order.orderId,
        { items: [{ orderItemId: await lineOf(order.orderId), quantity: 0.501 }] },
        ADMIN,
      ),
    ).rejects.toMatchObject({ code: "OVER_SHIPMENT" });
  });

  it("iptal kesri olduğu gibi geri veriyor", async () => {
    const before = await stockOf(kgId);
    const order = await place(kgId, 0.333);
    expect(await stockOf(kgId)).toBe(qtySub(before, 0.333));

    await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN);
    expect(await stockOf(kgId)).toBe(before);
  });

  it("ERP'nin kesirli sayısı kırpılmıyor", async () => {
    const result = await applyErpStock({ variantId: kgId, quantity: 12.35 });
    expect(await stockOf(kgId)).toBe(12.35);
    expect(result.movement?.balance).toBe(12.35);

    // Aynı sayı ikinci kez gelince fark sıfır: eskiden 12'ye kırpılıp her
    // gece 0,35'lik sahte bir hareket doğuyordu.
    const again = await applyErpStock({ variantId: kgId, quantity: 12.35 });
    expect(again.movement).toBeNull();
  });

  it("sayım ve elle hareket kalemin ölçeğine uyuyor", async () => {
    const count = await recordStockCount({ variantId: kgId, counted: 9.125 }, adminId);
    expect(count.counted).toBe(9.125);
    expect(await stockOf(kgId)).toBe(9.125);

    await expect(
      recordStockCount({ variantId: pieceId, counted: 3.5 }, adminId),
    ).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
    await expect(
      recordManualStockMovement(
        { variantId: pieceId, direction: "IN", quantity: 0.5, description: "Yarım" },
        adminId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
  });

  it("sepet kesri sayı olarak döndürüyor ve ölçeği taşıyor", async () => {
    const cart = await upsertCartItem(
      { companyId, variantId: kgId, quantity: 0.25 },
      buyerId,
    );
    const line = cart.lines.find((l) => l.variantId === kgId)!;
    expect(line.quantity).toBe(0.25);
    expect(line.quantityScale).toBe(3);
    expect(line.unit).toBe("KG");

    await upsertCartItem(
      { companyId, variantId: kgId, quantity: 0.5, increment: true },
      buyerId,
    );
    const after = await getCart(companyId, buyerId);
    expect(after.lines.find((l) => l.variantId === kgId)!.quantity).toBe(0.75);

    await expect(
      upsertCartItem({ companyId, variantId: pieceId, quantity: 1.5 }, buyerId),
    ).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
  });
});

async function lineOf(orderId: string): Promise<string> {
  const item = await prisma.orderItem.findFirstOrThrow({
    where: { orderId },
    select: { id: true },
  });
  return item.id;
}
