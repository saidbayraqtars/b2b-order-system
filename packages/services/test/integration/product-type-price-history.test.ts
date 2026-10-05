import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { SERVICE_STOCK } from "@repo/types";
import { getCart, upsertCartItem } from "../../src/cart";
import { getCatalogProduct } from "../../src/catalog";
import { ingestPrices } from "../../src/erp-ingest";
import { createOrder } from "../../src/order";
import { changeOrderStatus } from "../../src/order-lifecycle";
import { listProductPriceHistory } from "../../src/price-history";
import { applyDuePriceChanges, schedulePriceChange } from "../../src/price-schedule";
import { deletePrice, upsertPrice } from "../../src/pricing-admin";
import { actOnReturn, createReturn } from "../../src/rma";
import { createShipment } from "../../src/shipment";
import { listLowStock, listStockLevels } from "../../src/stock-admin";
import { createVariantUnit, updateVariantUnit } from "../../src/variant-unit";
import { useOwnDefaultSeries, type SeriesFixture } from "./series-fixture";

// Ürün tipi ve fiyat geçmişi (D5 ürün formu, Said'in 2026-10-05 kararları).
//
// Hizmet (nakliye, montaj) stok tutmuyor: stok 0'da satılır, sipariş, iptal ve
// iade defterde hareket yazmaz, stok ekranlarında görünmez, katalog adet
// yerine SERVICE_STOCK gönderir. Fiyat geçmişi: fiyat yazan her yol tek
// kapıdan (recordPriceChange) satır bırakır; aynı fiyat yazılmaz, silme
// `newPrice` null bırakır, grup ve birim adı o anki adıyla saklanır.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `hizmet${Date.now()}`;
const ADMIN = { userId: "", role: "SUPER_ADMIN" as const };

let groupId: string;
let categoryId: string;
let companyId: string;
let buyerId: string;
let adminId: string;
let serviceProductId: string;
let serviceVariantId: string;
let goodsProductId: string;
let goodsVariantId: string;
let series: SeriesFixture;

suite("ürün tipi ve fiyat geçmişi integration", () => {
  beforeAll(async () => {
    series = await useOwnDefaultSeries(TAG);

    groupId = (await prisma.customerGroup.create({ data: { name: `Bayi ${TAG}` } })).id;
    categoryId = (
      await prisma.category.create({ data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` } })
    ).id;
    companyId = (
      await prisma.company.create({
        data: { name: `Firma ${TAG}`, creditLimit: 10_000_000 },
      })
    ).id;
    buyerId = (
      await prisma.user.create({
        data: {
          email: `buyer-${TAG}@test.local`,
          name: "Hizmet Alıcı",
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
          name: "Fiyat Yöneticisi",
          passwordHash: "x",
          role: "SUPER_ADMIN",
        },
      })
    ).id;
    ADMIN.userId = adminId;

    // Hizmetin stoğu 0 ve kritik seviyesi var: ikisi de hizmette anlamsız,
    // listede çıkarsa sızıntı var demektir.
    const service = await prisma.product.create({
      data: {
        name: `Nakliye ${TAG}`,
        slug: `nakliye-${TAG}`,
        type: "SERVICE",
        vatRate: 20,
        categoryId,
        variants: {
          create: {
            sku: `NAK-${TAG}`,
            externalCode: `NAK-${TAG}`,
            unit: "ADET",
            unitsPerCase: 1,
            moqUnits: 1,
            stock: 0,
            minStock: 5,
          },
        },
      },
      include: { variants: true },
    });
    serviceProductId = service.id;
    serviceVariantId = service.variants[0]!.id;

    const goods = await prisma.product.create({
      data: {
        name: `Koli Bandı ${TAG}`,
        slug: `bant-${TAG}`,
        vatRate: 20,
        categoryId,
        variants: {
          create: {
            sku: `BANT-${TAG}`,
            unit: "ADET",
            unitsPerCase: 1,
            moqUnits: 1,
            stock: 3,
            minStock: 5,
          },
        },
      },
      include: { variants: true },
    });
    goodsProductId = goods.id;
    goodsVariantId = goods.variants[0]!.id;

    await prisma.price.create({
      data: { variantId: serviceVariantId, minQuantity: 1, price: 250 },
    });
    await prisma.price.create({
      data: { variantId: goodsVariantId, minQuantity: 1, price: 10 },
    });
  });

  afterAll(async () => {
    if (!hasDb) return;
    const variantIds = [serviceVariantId, goodsVariantId];
    const orders = await prisma.order.findMany({ where: { companyId }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    await prisma.returnRequest.deleteMany({ where: { companyId } });
    await prisma.stockMovement.updateMany({
      where: { variantId: { in: variantIds } },
      data: { reversalOfId: null, counterpartId: null },
    });
    await prisma.stockMovement.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.cart.deleteMany({ where: { companyId } });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await series.restore();
    await prisma.scheduledPriceChange.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.priceHistory.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.price.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: [serviceProductId, goodsProductId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.$disconnect();
  });

  const movementsOf = (variantId: string) =>
    prisma.stockMovement.count({ where: { variantId } });
  const stockOf = async (variantId: string) =>
    Number(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    );
  const placeService = (quantity: number) =>
    createOrder(
      {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId: serviceVariantId, quantity }],
      },
      { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
    );

  describe("hizmet stok tutmuyor", () => {
    it("stok 0'dayken sipariş alınıyor; ne stok ne defter oynuyor", async () => {
      const order = await placeService(3);
      expect(order.orderId).toBeTruthy();
      expect(await stockOf(serviceVariantId)).toBe(0);
      expect(await movementsOf(serviceVariantId)).toBe(0);
    });

    it("mal stoğu aşınca hâlâ reddediliyor (hizmet istisnası yalnız hizmette)", async () => {
      await expect(
        createOrder(
          {
            companyId,
            paymentMethod: "OPEN_ACCOUNT",
            items: [{ variantId: goodsVariantId, quantity: 4 }],
          },
          { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
        ),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    });

    it("iptal hizmete stok geri yazmıyor", async () => {
      const order = await placeService(2);
      await changeOrderStatus(
        order.orderId,
        { status: "CANCELLED" },
        { userId: adminId, role: "SUPER_ADMIN", companyId: null },
      );
      expect(await stockOf(serviceVariantId)).toBe(0);
      expect(await movementsOf(serviceVariantId)).toBe(0);
    });

    it("sağlam iade teslim alınınca hizmete stok girmiyor", async () => {
      const order = await placeService(1);
      const item = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.orderId },
        select: { id: true },
      });
      await createShipment(order.orderId, { items: [{ orderItemId: item.id, quantity: 1 }] }, ADMIN);

      const opened = await createReturn(
        {
          orderId: order.orderId,
          reason: "Nakliye yapılmadı",
          items: [{ orderItemId: item.id, quantity: 1, condition: "RESELLABLE" }],
        },
        { userId: buyerId, canManage: false },
        { companyId },
      );
      const manager = { userId: adminId, canManage: true };
      await actOnReturn(opened.id, { status: "APPROVED" }, manager, {});
      const received = await actOnReturn(opened.id, { status: "RECEIVED" }, manager, {});

      expect(received.status).toBe("RECEIVED");
      expect(await stockOf(serviceVariantId)).toBe(0);
      expect(await movementsOf(serviceVariantId)).toBe(0);
    });

    it("stok listesinde ve kritik stok listesinde yok; mal var", async () => {
      const levels = await listStockLevels({ q: TAG });
      const skus = levels.map((r) => r.sku);
      expect(skus).toContain(`BANT-${TAG}`);
      expect(skus).not.toContain(`NAK-${TAG}`);

      const low = await listLowStock(1000);
      const lowIds = low.map((r) => r.variantId);
      expect(lowIds).toContain(goodsVariantId);
      expect(lowIds).not.toContain(serviceVariantId);
    });

    it("katalog ve sepet hizmeti isService ve SERVICE_STOCK ile gönderiyor", async () => {
      const service = await getCatalogProduct(serviceProductId, companyId);
      expect(service?.isService).toBe(true);
      expect(service?.variants[0]?.stock).toBe(SERVICE_STOCK);

      const goods = await getCatalogProduct(goodsProductId, companyId);
      expect(goods?.isService).toBe(false);
      expect(goods?.variants[0]?.stock).toBe(3);

      await upsertCartItem({ companyId, variantId: serviceVariantId, quantity: 1 }, buyerId);
      const cart = await getCart(companyId, buyerId);
      const line = cart.lines.find((l) => l.variantId === serviceVariantId);
      expect(line?.stock).toBe(SERVICE_STOCK);
    });
  });

  describe("fiyat geçmişi", () => {
    const historyOf = async (variantId: string) =>
      prisma.priceHistory.findMany({
        where: { variantId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

    it("elle değişiklik eski ve yeni fiyatı, değiştireni yazıyor", async () => {
      await upsertPrice(goodsVariantId, { minQuantity: 1, price: 12, currency: "TRY" }, adminId);
      const rows = await historyOf(goodsVariantId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source: "MANUAL",
        groupName: null,
        unitName: null,
        changedById: adminId,
      });
      expect(rows[0]!.oldPrice?.toFixed(2)).toBe("10.00");
      expect(rows[0]!.newPrice?.toFixed(2)).toBe("12.00");
    });

    it("aynı fiyatı yeniden yazmak geçmişe satır eklemiyor", async () => {
      await upsertPrice(goodsVariantId, { minQuantity: 1, price: 12, currency: "TRY" }, adminId);
      expect(await historyOf(goodsVariantId)).toHaveLength(1);
    });

    it("yeni grup fiyatı eski fiyatsız açılıyor, grup adı saklanıyor; silme newPrice null", async () => {
      const row = await upsertPrice(
        goodsVariantId,
        { customerGroupId: groupId, minQuantity: 1, price: 11, currency: "TRY" },
        adminId,
      );
      await deletePrice(row.id, adminId);

      const rows = (await historyOf(goodsVariantId)).filter((r) => r.groupName === `Bayi ${TAG}`);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.oldPrice).toBeNull();
      expect(rows[0]!.newPrice?.toFixed(2)).toBe("11.00");
      expect(rows[1]!.oldPrice?.toFixed(2)).toBe("11.00");
      expect(rows[1]!.newPrice).toBeNull();
    });

    it("paket birimi fiyatı birim adıyla UNIT kaynağından yazılıyor", async () => {
      const koli = await createVariantUnit(
        goodsVariantId,
        { name: "koli", factor: 10, price: 110 },
        adminId,
      );
      await updateVariantUnit(koli.id, { price: 105 }, adminId);

      const rows = (await historyOf(goodsVariantId)).filter((r) => r.source === "UNIT");
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.unitName === "KOLİ")).toBe(true);
      expect(rows[0]!.oldPrice).toBeNull();
      expect(rows[1]!.oldPrice?.toFixed(2)).toBe("110.00");
      expect(rows[1]!.newPrice?.toFixed(2)).toBe("105.00");
    });

    it("zamanlı değişiklik uygulanınca SCHEDULE kaynağıyla, planlayanın adıyla yazılıyor", async () => {
      await schedulePriceChange(
        {
          variantId: serviceVariantId,
          customerGroupId: null,
          minQuantity: 1,
          price: 300,
          effectiveAt: new Date(Date.now() + 86_400_000),
        },
        adminId,
      );
      await prisma.scheduledPriceChange.updateMany({
        where: { variantId: serviceVariantId, status: "PENDING" },
        data: { effectiveAt: new Date(Date.now() - 60_000) },
      });
      const result = await applyDuePriceChanges();
      expect(result.failed).toBe(0);

      const rows = await historyOf(serviceVariantId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ source: "SCHEDULE", changedById: adminId });
      expect(rows[0]!.oldPrice?.toFixed(2)).toBe("250.00");
      expect(rows[0]!.newPrice?.toFixed(2)).toBe("300.00");
    });

    it("ERP eşitlemesi ERP kaynağıyla, kişisiz yazılıyor", async () => {
      const result = await ingestPrices([{ code: `NAK-${TAG}`, price: 320 }], null);
      expect(result.applied).toBe(1);

      const rows = (await historyOf(serviceVariantId)).filter((r) => r.source === "ERP");
      expect(rows).toHaveLength(1);
      expect(rows[0]!.changedById).toBeNull();
      expect(rows[0]!.newPrice?.toFixed(2)).toBe("320.00");
    });

    it("ürün geçmişi en yenisi önce, SKU ve değiştirenin adıyla listeleniyor", async () => {
      const list = await listProductPriceHistory(goodsProductId);
      expect(list.length).toBe(5);
      expect(list.every((r) => r.sku === `BANT-${TAG}`)).toBe(true);
      expect(list[0]).toMatchObject({ source: "UNIT", newPrice: "105.00" });
      expect(list.at(-1)).toMatchObject({
        source: "MANUAL",
        oldPrice: "10.00",
        newPrice: "12.00",
        changedByName: "Fiyat Yöneticisi",
      });
    });
  });
});
