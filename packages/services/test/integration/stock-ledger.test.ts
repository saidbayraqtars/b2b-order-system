import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { createOrder } from "../../src/order";
import { rejectOrder } from "../../src/order-approval";
import { changeOrderStatus } from "../../src/order-lifecycle";
import {
  applyErpStock,
  getStockSummary,
  listStockMovements,
  recordManualStockMovement,
  recordStockCount,
  reverseStockMovement,
  transferStock,
} from "../../src/stock-ledger";
import { upsertWarehouse } from "../../src/stock-admin";

// Stok defteri gerçek veritabanına karşı.
//
// Kanıtlaması gereken iddia adımın kendisi: eldeki adet artık defterin bakiyesi.
// Yani stoku değiştiren her yol bir satır bırakmak zorunda (sipariş, iptal, ret,
// sayım, ERP, elle), ve bakiye o satırların toplamıyla aynı yere varmak zorunda.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `stok${Date.now()}`;

let groupId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let companyId: string;
let buyerId: string;
let staffId: string;
let adminId: string;
let warehouseAId: string;
let warehouseBId: string;

const ADMIN = () => ({ userId: adminId, role: "SUPER_ADMIN" as const });

/** Bakiye satırdan okunuyor: asıl iddia önbellek kolonunun doğruluğu. */
async function stockOf(): Promise<number> {
  const row = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { stock: true },
  });
  return row.stock;
}

async function onHandOf(warehouseId: string): Promise<number> {
  const row = await prisma.variantStock.findUnique({
    where: { variantId_warehouseId: { variantId, warehouseId } },
    select: { onHand: true },
  });
  return row?.onHand ?? 0;
}

/** Bu varyanta ait son hareket. */
async function lastMovement() {
  const [row] = await listStockMovements({ variantId, limit: 1 });
  return row;
}

suite("stok hareket defteri integration", () => {
  beforeAll(async () => {
    const group = await prisma.customerGroup.create({ data: { name: `Grup ${TAG}` } });
    groupId = group.id;

    const category = await prisma.category.create({
      data: { name: `Kategori ${TAG}`, slug: `kat-${TAG}` },
    });
    categoryId = category.id;

    const company = await prisma.company.create({
      data: {
        name: `Firma ${TAG}`,
        creditLimit: 10_000_000,
        customerGroupId: groupId,
        requiresOrderApproval: true,
      },
    });
    companyId = company.id;

    const buyer = await prisma.user.create({
      data: {
        email: `buyer-${TAG}@test.local`,
        name: "Stok Alıcı",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    buyerId = buyer.id;

    const staff = await prisma.user.create({
      data: {
        email: `staff-${TAG}@test.local`,
        name: "Stok Personel",
        passwordHash: "x",
        role: "COMPANY_STAFF",
        companyId,
      },
    });
    staffId = staff.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin-${TAG}@test.local`,
        name: "Stok Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    const product = await prisma.product.create({
      data: {
        name: `Ürün ${TAG}`,
        slug: `urun-${TAG}`,
        vatRate: 0,
        categoryId,
        variants: {
          create: [{ sku: `SKU-${TAG}`, unitsPerCase: 1, moqUnits: 1, stock: 100 }],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;

    await prisma.price.create({
      data: { variantId, customerGroupId: groupId, minQuantity: 1, price: 100 },
    });

    const a = await upsertWarehouse({ code: `A-${TAG}`, name: `Merkez ${TAG}` });
    const b = await upsertWarehouse({ code: `B-${TAG}`, name: `Şube ${TAG}` });
    warehouseAId = a.id;
    warehouseBId = b.id;
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { companyId },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    // Ters kayıt ve aktarım bacakları birbirini gösteriyor; bağı kesmeden silmek
    // yabancı anahtara takılır.
    await prisma.stockMovement.updateMany({
      where: { variantId },
      data: { reversalOfId: null, counterpartId: null },
    });
    await prisma.stockMovement.deleteMany({ where: { variantId } });
    await prisma.variantStock.deleteMany({ where: { variantId } });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.price.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, staffId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    await prisma.warehouse.deleteMany({
      where: { id: { in: [warehouseAId, warehouseBId] } },
    });
    await prisma.$disconnect();
  });

  const place = (quantity: number) =>
    createOrder(
      { companyId, paymentMethod: "OPEN_ACCOUNT", items: [{ variantId, quantity }] },
      { createdById: buyerId, createdByRole: "COMPANY_ADMIN" },
    );

  describe("sipariş", () => {
    it("writes an OUT entry naming the order, and moves the balance with it", async () => {
      const before = await stockOf();
      const order = await place(4);

      expect(await stockOf()).toBe(before - 4);

      const entry = await lastMovement();
      expect(entry?.direction).toBe("OUT");
      expect(entry?.source).toBe("ORDER");
      expect(entry?.quantity).toBe(4);
      expect(entry?.orderNumber).toBe(order.orderNumber);
      // Satırdaki bakiye gerçekten *bu hareketten sonraki* bakiye olmalı:
      // defteri okuyanın sorusu "o an kaça düştü".
      expect(entry?.balanceAfter).toBe(before - 4);
    });

    it("gives the goods back when the order is cancelled", async () => {
      const before = await stockOf();
      const order = await place(6);
      expect(await stockOf()).toBe(before - 6);

      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());

      expect(await stockOf()).toBe(before);
      const entry = await lastMovement();
      expect(entry?.direction).toBe("IN");
      expect(entry?.source).toBe("ORDER_CANCEL");
      expect(entry?.quantity).toBe(6);
    });

    it("gives them back on rejection too", async () => {
      const before = await stockOf();
      // Firma onay istiyor ve personel sipariş giriyor: sipariş beklemede doğar
      // ama malı yine de tutar.
      const pending = await createOrder(
        { companyId, paymentMethod: "OPEN_ACCOUNT", items: [{ variantId, quantity: 3 }] },
        { createdById: staffId, createdByRole: "COMPANY_STAFF" },
      );
      expect(pending.status).toBe("PENDING_APPROVAL");
      expect(await stockOf()).toBe(before - 3);

      await rejectOrder(pending.orderId, {
        approverId: adminId,
        approverRole: "SUPER_ADMIN",
        approverCompanyId: null,
      });

      expect(await stockOf()).toBe(before);
      expect((await lastMovement())?.source).toBe("ORDER_CANCEL");
    });

    it("refuses to be undone from the stock screen", async () => {
      const order = await place(2);
      const [entry] = await listStockMovements({ variantId, limit: 1 });

      await expect(
        reverseStockMovement({ movementId: entry!.id, reason: "yanlış" }, adminId),
      ).rejects.toThrow(/siparişi iptal edin/i);

      await changeOrderStatus(order.orderId, { status: "CANCELLED" }, ADMIN());
    });
  });

  describe("elle giriş", () => {
    it("moves the balance and records who and why", async () => {
      const before = await stockOf();
      await recordManualStockMovement(
        { variantId, direction: "OUT", quantity: 5, description: "Fire" },
        adminId,
      );

      expect(await stockOf()).toBe(before - 5);
      const entry = await lastMovement();
      expect(entry?.source).toBe("MANUAL");
      expect(entry?.description).toBe("Fire");
      expect(entry?.recordedByName).toBe("Stok Admin");
    });

    it("refuses an entry that would push the balance negative", async () => {
      const before = await stockOf();
      await expect(
        recordManualStockMovement(
          { variantId, direction: "OUT", quantity: before + 1, description: "Fazla" },
          adminId,
        ),
      ).rejects.toThrow(/eksiye/i);

      // İşlem geri sarılmalı: ne bakiye ne de defter kımıldamış olmalı.
      expect(await stockOf()).toBe(before);
    });

    it("is undone by its opposite, and only once", async () => {
      const before = await stockOf();
      const movement = await recordManualStockMovement(
        { variantId, direction: "OUT", quantity: 7, description: "Yanlış fire" },
        adminId,
      );
      expect(await stockOf()).toBe(before - 7);

      await reverseStockMovement(
        { movementId: movement.id, reason: "yanlış girildi" },
        adminId,
      );
      expect(await stockOf()).toBe(before);

      await expect(
        reverseStockMovement({ movementId: movement.id, reason: "yine" }, adminId),
      ).rejects.toThrow(/zaten iptal/i);
    });
  });

  describe("sayım", () => {
    it("writes the difference, not the counted figure", async () => {
      const before = await stockOf();
      const result = await recordStockCount(
        { variantId, counted: before - 3 },
        adminId,
      );

      expect(result.difference).toBe(-3);
      expect(await stockOf()).toBe(before - 3);
      const entry = await lastMovement();
      expect(entry?.source).toBe("COUNT");
      expect(entry?.quantity).toBe(3);
      expect(entry?.direction).toBe("OUT");
    });

    it("writes nothing at all when the count agrees with the ledger", async () => {
      const before = await stockOf();
      const countBefore = await prisma.stockMovement.count({ where: { variantId } });

      const result = await recordStockCount({ variantId, counted: before }, adminId);

      expect(result.movement).toBeNull();
      expect(await prisma.stockMovement.count({ where: { variantId } })).toBe(
        countBefore,
      );
    });
  });

  describe("depolar arası aktarım", () => {
    it("moves the breakdown without moving the total", async () => {
      await recordManualStockMovement(
        {
          variantId,
          warehouseId: warehouseAId,
          direction: "IN",
          quantity: 20,
          description: "Mal girişi",
        },
        adminId,
      );
      const total = await stockOf();
      expect(await onHandOf(warehouseAId)).toBe(20);

      await transferStock(
        {
          variantId,
          fromWarehouseId: warehouseAId,
          toWarehouseId: warehouseBId,
          quantity: 8,
        },
        adminId,
      );

      expect(await stockOf()).toBe(total);
      expect(await onHandOf(warehouseAId)).toBe(12);
      expect(await onHandOf(warehouseBId)).toBe(8);
    });

    it("refuses to move more than the source warehouse holds", async () => {
      await expect(
        transferStock(
          {
            variantId,
            fromWarehouseId: warehouseBId,
            toWarehouseId: warehouseAId,
            quantity: 999,
          },
          adminId,
        ),
      ).rejects.toThrow(/yeterli mal yok/i);

      expect(await onHandOf(warehouseBId)).toBe(8);
    });

    it("undoes both legs when one of them is reversed", async () => {
      const totalBefore = await stockOf();
      const transfer = await transferStock(
        {
          variantId,
          fromWarehouseId: warehouseAId,
          toWarehouseId: warehouseBId,
          quantity: 5,
        },
        adminId,
      );
      expect(await onHandOf(warehouseBId)).toBe(13);

      await reverseStockMovement(
        { movementId: transfer.outMovementId, reason: "yanlış depo" },
        adminId,
      );

      expect(await onHandOf(warehouseAId)).toBe(12);
      expect(await onHandOf(warehouseBId)).toBe(8);
      expect(await stockOf()).toBe(totalBefore);
    });
  });

  describe("ERP senkronu", () => {
    it("writes the difference instead of overwriting the number", async () => {
      const before = await stockOf();
      const result = await applyErpStock({ variantId, quantity: before + 15 });

      expect(result.difference).toBe(15);
      expect(await stockOf()).toBe(before + 15);
      const entry = await lastMovement();
      expect(entry?.source).toBe("ERP");
      expect(entry?.direction).toBe("IN");
      expect(entry?.quantity).toBe(15);
    });

    it("stays silent when the ERP agrees — an hourly sync must not fill the ledger", async () => {
      const before = await stockOf();
      const countBefore = await prisma.stockMovement.count({ where: { variantId } });

      const result = await applyErpStock({ variantId, quantity: before });

      expect(result.movement).toBeNull();
      expect(await prisma.stockMovement.count({ where: { variantId } })).toBe(
        countBefore,
      );
    });
  });

  describe("özet", () => {
    it("splits the period by why the goods moved", async () => {
      const summary = await getStockSummary({
        from: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
      });

      const sources = summary.bySource.map((s) => s.source);
      expect(sources).toContain("ORDER");
      expect(sources).toContain("MANUAL");
      expect(sources).toContain("COUNT");
      expect(summary.totalIn).toBeGreaterThan(0);
      expect(summary.totalOut).toBeGreaterThan(0);
    });
  });
});
