import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { listShipmentLots } from "../../src/stock-lot";

// İrsaliyeye basılan parti dökümü.
//
// Zor kısım bölüşüm. Parti seçimi **sipariş anında** yapılıyor (FEFO), sevk
// anında değil — stok da o an düşüyor. Yani irsaliye başına bir parti kaydı
// yok, ve uydurulacak da değil: siparişin ayırdığı partiler sevk sırasına göre
// bölüştürülüyor. Bu dosyanın sınadığı şey o bölüşümün doğru olması:
//
//  - İlk irsaliye, sıranın **başından** alıyor.
//  - İkinci irsaliye, birincinin bıraktığı yerden devam ediyor — aynı partiyi
//    ikinci kez yazmıyor.
//  - Bir parti iki irsaliye arasında **bölünebiliyor**: 30'luk partinin 25'i
//    ilk kamyona, 5'i ikinciye.
//  - İptal edilmiş (ters kayıtlı) çıkış hiçbir irsaliyeye girmiyor.
//  - Ayrım yetmezse kalan adet partisiz dönüyor — olmayan bir parti kodu
//    yazmaktansa hücre boş kalır.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `shiplot${Date.now()}`;

let adminId: string;
let companyId: string;
let categoryId: string;
let productId: string;
/** Parti takipli kalem. */
let lotVariant: string;
/** Parti takibi olmayan kalem. */
let plainVariant: string;
let orderId: string;
let lotItemId: string;
let plainItemId: string;
let lotA: string;
let lotB: string;
const shipmentIds: string[] = [];
const movementIds: string[] = [];
let seriesCounter = 0;

const base = new Date(2026, 5, 1, 9);
const at = (hours: number) => new Date(base.getTime() + hours * 3_600_000);

/** Defterin çıkış satırı — sipariş anında ayrılan parti. */
async function out(options: {
  variantId: string;
  quantity: number;
  lotId?: string;
  occurredAt: Date;
  reversed?: boolean;
}): Promise<void> {
  const row = await prisma.stockMovement.create({
    data: {
      variantId: options.variantId,
      direction: "OUT",
      quantity: options.quantity,
      source: "ORDER",
      balanceAfter: 0,
      orderId,
      lotId: options.lotId ?? null,
      occurredAt: options.occurredAt,
    },
  });
  movementIds.push(row.id);

  if (options.reversed) {
    const reversal = await prisma.stockMovement.create({
      data: {
        variantId: options.variantId,
        direction: "IN",
        quantity: options.quantity,
        source: "ORDER_CANCEL",
        balanceAfter: 0,
        orderId,
        lotId: options.lotId ?? null,
        occurredAt: options.occurredAt,
        reversalOfId: row.id,
      },
    });
    movementIds.push(reversal.id);
  }
}

/** Bir irsaliye; `lines` = orderItem id → sevk adedi. */
async function shipment(
  shippedAt: Date,
  lines: Array<[string, number]>,
): Promise<string> {
  seriesCounter += 1;
  const row = await prisma.shipment.create({
    data: {
      orderId,
      documentNumber: `IRS-${TAG}-${seriesCounter}`,
      shippedAt,
      shippedById: adminId,
      items: {
        create: lines.map(([orderItemId, quantity]) => ({
          orderItemId,
          quantity,
        })),
      },
    },
  });
  shipmentIds.push(row.id);
  return row.id;
}

/** Tek kalemin parti satırları, kâğıttaki sırayla. */
async function lotsOf(shipmentId: string, sku: string) {
  const lines = await listShipmentLots(shipmentId);
  const line = lines.find((l) => l.sku === sku);
  expect(line).toBeDefined();
  return line!.lots;
}

suite("irsaliyenin parti dökümü", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `${TAG}@test.local`,
        name: "İrsaliye Admin",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;

    const company = await prisma.company.create({
      data: { name: `Firma ${TAG}`, creditLimit: 10_000_000 },
    });
    companyId = company.id;

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
        variants: {
          create: [
            { sku: `LOT-${TAG}`, unitsPerCase: 1, moqUnits: 1 },
            { sku: `PLAIN-${TAG}`, unitsPerCase: 1, moqUnits: 1 },
          ],
        },
      },
      include: { variants: { orderBy: { sku: "asc" } } },
    });
    productId = product.id;
    lotVariant = product.variants.find((v) => v.sku.startsWith("LOT"))!.id;
    plainVariant = product.variants.find((v) => v.sku.startsWith("PLAIN"))!.id;

    const a = await prisma.stockLot.create({
      data: {
        variantId: lotVariant,
        code: `A-${TAG}`,
        expiryDate: new Date(Date.UTC(2027, 0, 15)),
        onHand: 0,
      },
    });
    lotA = a.id;
    const b = await prisma.stockLot.create({
      data: {
        variantId: lotVariant,
        code: `B-${TAG}`,
        expiryDate: new Date(Date.UTC(2027, 5, 15)),
        onHand: 0,
      },
    });
    lotB = b.id;

    const order = await prisma.order.create({
      data: {
        orderNumber: `SIP-${TAG}`,
        status: "CONFIRMED",
        companyId,
        createdById: adminId,
        subtotal: 1000,
        grandTotal: 1200,
        items: {
          create: [
            {
              variantId: lotVariant,
              productName: `Ürün ${TAG}`,
              sku: `LOT-${TAG}`,
              quantity: 50,
              unitPrice: 10,
              lineTotal: 500,
            },
            {
              variantId: plainVariant,
              productName: `Ürün ${TAG}`,
              sku: `PLAIN-${TAG}`,
              quantity: 10,
              unitPrice: 50,
              lineTotal: 500,
            },
          ],
        },
      },
      include: { items: true },
    });
    orderId = order.id;
    lotItemId = order.items.find((i) => i.variantId === lotVariant)!.id;
    plainItemId = order.items.find((i) => i.variantId === plainVariant)!.id;

    // Sipariş anındaki FEFO ayrımı: önce A (yakın SKT) 30, sonra B 20.
    await out({ variantId: lotVariant, quantity: 30, lotId: lotA, occurredAt: at(0) });
    await out({ variantId: lotVariant, quantity: 20, lotId: lotB, occurredAt: at(1) });
    // İptal edilmiş bir çıkış: hiçbir irsaliyeye girmemeli.
    await out({
      variantId: lotVariant,
      quantity: 99,
      lotId: lotB,
      occurredAt: at(2),
      reversed: true,
    });
    // Parti takibi olmayan kalem: partisiz çıkış satırı.
    await out({ variantId: plainVariant, quantity: 10, occurredAt: at(0) });
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { id: { in: movementIds } } });
    await prisma.shipmentItem.deleteMany({
      where: { shipmentId: { in: shipmentIds } },
    });
    await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.stockLot.deleteMany({ where: { id: { in: [lotA, lotB] } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("ilk irsaliye sıranın başından alıyor, partiyi bölebiliyor", async () => {
    const first = await shipment(at(10), [[lotItemId, 25]]);
    const lots = await lotsOf(first, `LOT-${TAG}`);

    // 30'luk A partisinin 25'i bu kamyonda.
    expect(lots).toHaveLength(1);
    expect(lots[0]!.code).toBe(`A-${TAG}`);
    expect(lots[0]!.quantity).toBe(25);
  });

  it("ikinci irsaliye birincinin bıraktığı yerden devam ediyor", async () => {
    const second = await shipment(at(20), [[lotItemId, 25]]);
    const lots = await lotsOf(second, `LOT-${TAG}`);

    // A'dan kalan 5, sonra B'den 20. A ikinci kez baştan yazılmıyor.
    expect(lots.map((l) => [l.code, l.quantity])).toEqual([
      [`A-${TAG}`, 5],
      [`B-${TAG}`, 20],
    ]);
  });

  it("iptal edilmiş çıkış hiçbir irsaliyeye girmiyor", async () => {
    // 99'luk ters kayıtlı satır sayılsaydı ikinci irsaliyede görünürdü.
    const second = shipmentIds[1]!;
    const lots = await lotsOf(second, `LOT-${TAG}`);
    expect(lots.reduce((n, l) => n + l.quantity, 0)).toBe(25);
  });

  it("SKT kâğıda basılabilsin diye satırda duruyor", async () => {
    const lots = await lotsOf(shipmentIds[0]!, `LOT-${TAG}`);
    expect(lots[0]!.expiryDate).toBe(new Date(Date.UTC(2027, 0, 15)).toISOString());
  });

  it("parti takibi olmayan kalem partisiz dönüyor", async () => {
    const third = await shipment(at(30), [[plainItemId, 10]]);
    const lots = await lotsOf(third, `PLAIN-${TAG}`);
    expect(lots).toEqual([{ code: null, expiryDate: null, quantity: 10 }]);
  });

  it("ayrım sevk edilen adedi karşılamıyorsa kalan partisiz", async () => {
    // Parti kalmadı: 50'nin 50'si önceki iki irsaliyede gitti. Fazladan sevk
    // edilen adet uydurma bir parti kodu almıyor.
    const extra = await shipment(at(40), [[lotItemId, 7]]);
    const lots = await lotsOf(extra, `LOT-${TAG}`);
    expect(lots).toEqual([{ code: null, expiryDate: null, quantity: 7 }]);
  });

  it("aynı irsaliyedeki her kalem kendi satırını alıyor", async () => {
    const lines = await listShipmentLots(shipmentIds[0]!);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(25);
    expect(lines[0]!.productName).toBe(`Ürün ${TAG}`);
  });
});
