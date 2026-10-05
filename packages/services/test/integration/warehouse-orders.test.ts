import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import { quoteOrder } from "../../src/order-quote";
import { changeOrderStatus } from "../../src/order-lifecycle";
import { listCatalog } from "../../src/catalog";
import {
  invalidateModuleCache,
  isModuleEnabled,
  setModuleEnabled,
} from "../../src/modules";
import { createShipment } from "../../src/shipment";
import { actOnReturn, createReturn } from "../../src/rma";
import { recordStockCount } from "../../src/stock-ledger";
import { listStockLevels, upsertWarehouse } from "../../src/stock-admin";
import { setWarehouseStockSettings } from "../../src/warehouse-stock";
import { useOwnDefaultSeries, type SeriesFixture } from "./series-fixture";

// F3 — depo bazlı stok, gerçek veritabanına karşı.
//
// İddia: "depo" modülü açıkken sipariş müşterinin deposunun adedine bakar ve
// o depodan düşer; iptal ve iade aynı depoya döner; "sipariş alınmasın" o
// depodan satışı keser. Modül kapalıyken (varsayılan) hiçbir şey değişmez.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `depo${Date.now()}`;

let categoryId: string;
let productId: string;
let variantId: string;
let companyId: string;
let buyerId: string;
let adminId: string;
let merkezId: string;
let subeId: string;
let depoBefore: { enabled: boolean } | null = null;
let series: SeriesFixture;

const ADMIN = () => ({ userId: adminId, role: "SUPER_ADMIN" as const });

async function onHandIn(warehouseId: string): Promise<number> {
  const row = await prisma.variantStock.findUnique({
    where: { variantId_warehouseId: { variantId, warehouseId } },
    select: { onHand: true },
  });
  return Number(row?.onHand ?? 0);
}

async function total(): Promise<number> {
  const v = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { stock: true },
  });
  return Number(v.stock);
}

const buyerOrder = (quantity: number, extra: { warehouseId?: string } = {}) =>
  createOrder(
    {
      companyId,
      paymentMethod: "OPEN_ACCOUNT",
      items: [{ variantId, quantity }],
      ...extra,
    },
    { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
  );

async function useDepoModule(enabled: boolean) {
  await setModuleEnabled("depo", enabled);
  invalidateModuleCache();
}

suite("depo bazlı stok (F3) integration", () => {
  beforeAll(async () => {
    depoBefore = await prisma.installationModule.findUnique({
      where: { key: "depo" },
      select: { enabled: true },
    });
    await prisma.installationModule.deleteMany({ where: { key: "depo" } });
    invalidateModuleCache();

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` },
    });
    categoryId = category.id;

    const merkez = await upsertWarehouse({
      code: `M-${TAG}`,
      name: `Merkez ${TAG}`,
    });
    const sube = await upsertWarehouse({
      code: `S-${TAG}`,
      name: `Şube ${TAG}`,
    });
    merkezId = merkez.id;
    subeId = sube.id;

    const company = await prisma.company.create({
      data: {
        name: `Firma ${TAG}`,
        creditLimit: 10_000_000,
        warehouseId: subeId,
      },
    });
    companyId = company.id;

    buyerId = (
      await prisma.user.create({
        data: {
          email: `buyer-${TAG}@test.local`,
          name: "Depo Alıcı",
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
          name: "Depo Admin",
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
          create: [{ sku: `SKU-${TAG}`, unitsPerCase: 1, moqUnits: 1 }],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;
    await prisma.price.create({
      data: { variantId, minQuantity: 1, price: 10 },
    });

    // Merkezde 20, şubede 3: toplam 23.
    await recordStockCount(
      { variantId, warehouseId: merkezId, counted: 20 },
      adminId,
    );
    await recordStockCount(
      { variantId, warehouseId: subeId, counted: 3 },
      adminId,
    );

    series = await useOwnDefaultSeries(TAG);
  });

  afterAll(async () => {
    if (!hasDb) return;
    await prisma.installationModule.deleteMany({ where: { key: "depo" } });
    if (depoBefore) {
      await prisma.installationModule.create({
        data: { key: "depo", ...depoBefore },
      });
    }
    invalidateModuleCache();

    const orders = await prisma.order.findMany({
      where: { companyId },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.returnRequest.deleteMany({ where: { companyId } });
    await prisma.stockMovement.updateMany({
      where: { variantId },
      data: { reversalOfId: null, counterpartId: null },
    });
    await prisma.stockMovement.deleteMany({ where: { variantId } });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await series.restore();
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.warehouse.deleteMany({
      where: { id: { in: [merkezId, subeId] } },
    });
    await prisma.$disconnect();
  });

  it("modül varsayılan olarak kapalı; sipariş toplamdan düşer, depo bilmez", async () => {
    expect(await isModuleEnabled("depo")).toBe(false);

    // Şubede 3 var ama modül kapalı: 5 adet toplamdan (23) karşılanır.
    // Modülün bilmediği bir alan olarak depo da yok sayılır: seçim yok.
    const order = await buyerOrder(5, { warehouseId: merkezId });
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.orderId },
      select: { warehouseId: true },
    });
    expect(row.warehouseId).toBeNull();
    expect(await total()).toBe(18);
    expect(await onHandIn(subeId)).toBe(3);
    expect(await onHandIn(merkezId)).toBe(20);

    await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());
    expect(await total()).toBe(23);
  });

  describe("modül açık", () => {
    beforeAll(() => useDepoModule(true));
    afterAll(() => useDepoModule(false));

    it("teklif müşterinin deposunun adedine bakar", async () => {
      await expect(
        quoteOrder({
          companyId,
          paymentMethod: "OPEN_ACCOUNT",
          items: [{ variantId, quantity: 5 }],
        }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

      const ok = await quoteOrder({
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 3 }],
      });
      expect(ok.warehouse?.id).toBe(subeId);
    });

    it("sipariş o depodan düşer, iptal aynı depoya geri verir", async () => {
      const order = await buyerOrder(2);
      const row = await prisma.order.findUniqueOrThrow({
        where: { id: order.orderId },
        select: { warehouseId: true },
      });
      expect(row.warehouseId).toBe(subeId);
      expect(await onHandIn(subeId)).toBe(1);
      expect(await onHandIn(merkezId)).toBe(20);
      expect(await total()).toBe(21);

      const out = await prisma.stockMovement.findFirstOrThrow({
        where: { orderId: order.orderId, source: "ORDER" },
        select: { warehouseId: true },
      });
      expect(out.warehouseId).toBe(subeId);

      // Modül kapatılsa da iptal malı çıktığı depoya verir.
      await useDepoModule(false);
      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());
      await useDepoModule(true);
      expect(await onHandIn(subeId)).toBe(3);
      expect(await total()).toBe(23);
    });

    it("katalog ve sepet müşterinin deposunun adedini gösterir", async () => {
      const catalog = await listCatalog({ companyId, search: `SKU-${TAG}` });
      const v = catalog
        .flatMap((p) => p.variants)
        .find((x) => x.id === variantId);
      expect(v?.stock).toBe(3);
    });

    it("satıcı başka depo seçebilir; müşteri seçemez", async () => {
      await expect(
        buyerOrder(1, { warehouseId: merkezId }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      const order = await createOrder(
        {
          companyId,
          paymentMethod: "OPEN_ACCOUNT",
          warehouseId: merkezId,
          items: [{ variantId, quantity: 8 }],
        },
        { createdById: adminId, createdByRole: "SUPER_ADMIN" },
      );
      expect(await onHandIn(merkezId)).toBe(12);
      expect(await onHandIn(subeId)).toBe(3);
      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());
      expect(await onHandIn(merkezId)).toBe(20);
    });

    it('"sipariş alınmasın" o depodan satışı keser, katalogda stoksuz görünür', async () => {
      const settings = await setWarehouseStockSettings({
        variantId,
        warehouseId: subeId,
        blockOrders: true,
      });
      expect(settings.onHand).toBe(3); // ayar miktara dokunmaz

      await expect(buyerOrder(1)).rejects.toMatchObject({
        code: "ORDER_BLOCKED",
      });
      const catalog = await listCatalog({ companyId, search: `SKU-${TAG}` });
      expect(
        catalog.flatMap((p) => p.variants).find((x) => x.id === variantId)
          ?.stock,
      ).toBe(0);

      // Merkezden satıcı yine satabilir: bayrak depoya ait, kaleme değil.
      const order = await createOrder(
        {
          companyId,
          paymentMethod: "OPEN_ACCOUNT",
          warehouseId: merkezId,
          items: [{ variantId, quantity: 1 }],
        },
        { createdById: adminId, createdByRole: "SUPER_ADMIN" },
      );
      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());

      await setWarehouseStockSettings({
        variantId,
        warehouseId: subeId,
        blockOrders: false,
      });
    });

    it("müşterinin deposu yoksa kurulumun varsayılanı", async () => {
      await upsertWarehouse({
        code: `M-${TAG}`,
        name: `Merkez ${TAG}`,
        isDefault: true,
      });
      await prisma.company.update({
        where: { id: companyId },
        data: { warehouseId: null },
      });

      const quote = await quoteOrder({
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 10 }],
      });
      expect(quote.warehouse?.id).toBe(merkezId);

      await prisma.company.update({
        where: { id: companyId },
        data: { warehouseId: subeId },
      });
    });

    it("iade sağlam malı siparişin deposuna geri koyar", async () => {
      const order = await buyerOrder(2);
      const item = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.orderId },
        select: { id: true },
      });
      await createShipment(
        order.orderId,
        { items: [{ orderItemId: item.id, quantity: 2 }] },
        { userId: adminId, role: "SUPER_ADMIN" },
      );
      expect(await onHandIn(subeId)).toBe(1);

      const scope = { companyId };
      const opened = await createReturn(
        {
          orderId: order.orderId,
          reason: "Fazla geldi",
          items: [
            { orderItemId: item.id, quantity: 2, condition: "RESELLABLE" },
          ],
        },
        { userId: buyerId, canManage: false },
        scope,
      );
      const manager = { userId: adminId, canManage: true };
      await actOnReturn(opened.id, { status: "APPROVED" }, manager, {});
      await actOnReturn(opened.id, { status: "RECEIVED" }, manager, {});

      expect(await onHandIn(subeId)).toBe(3);
      expect(await onHandIn(merkezId)).toBe(20);
    });

    it("stok ekranı depo seçiliyken o deponun kritik seviyesine bakar", async () => {
      await setWarehouseStockSettings({
        variantId,
        warehouseId: subeId,
        minStock: 5,
      });
      await setWarehouseStockSettings({
        variantId,
        warehouseId: merkezId,
        minStock: 5,
      });

      const sube = await listStockLevels({
        q: `SKU-${TAG}`,
        warehouseId: subeId,
        lowOnly: true,
      });
      expect(sube.map((r) => r.variantId)).toEqual([variantId]);
      expect(sube[0]).toMatchObject({
        warehouseOnHand: 3,
        warehouseMinStock: 5,
      });

      // Merkezde 20 var, eşik 5: kritik değil.
      const merkez = await listStockLevels({
        q: `SKU-${TAG}`,
        warehouseId: merkezId,
        lowOnly: true,
      });
      expect(merkez).toEqual([]);
    });
  });
});
