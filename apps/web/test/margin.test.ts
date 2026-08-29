import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  computeSnapshot,
  saveSnapshot,
  type MarginSnapshot,
} from "@repo/services";
import { GET as getAnalytics } from "@/app/api/analytics/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Kârlılık bölümü (§6.3'ün "SatisKarlilik" boşluğu).
//
// Matematiğin kendisi `analytics-math.test.ts`te; buradaki iddialar **SQL'e**
// ait ve ikisi de sessizce yanlış olabilecek cinsten:
//
//  1. Firma iskontosu `discount − volumeDiscount` olarak ayrılıyor. `discount`
//     zaten hacim payını **içeriyor**; ayrılmasaydı köprüde aynı para iki kez
//     düşer ve net ciro tutmazdı.
//  2. Kapsanan ciro yalnızca alış fiyatı **girilmiş** varyanttan sayılıyor.
//     `costPrice = 0` girilmiş sayılsaydı maliyeti boş bir katalogda kapsam
//     %100 çıkar ve pano uydurma bir marj basardı.

const fx = new Fixtures("margin");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let companyId: string;
let priced: { variantId: string; productId: string; categoryId: string };
let unpriced: { variantId: string; productId: string; categoryId: string };

/** Bu dosyanın ürettiği siparişler; teardown ve iddialar bunlara bakıyor. */
const orderIds: string[] = [];

async function order(lines: Array<{
  variantId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  volumeDiscount?: number;
  promotionDiscount?: number;
}>): Promise<void> {
  const items = lines.map((l) => {
    const discount = l.discount ?? 0;
    const promotion = l.promotionDiscount ?? 0;
    return {
      variantId: l.variantId,
      productName: "Kârlılık ürünü",
      sku: `SKU-${l.variantId.slice(-6)}`,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount,
      volumeDiscount: l.volumeDiscount ?? 0,
      promotionDiscount: promotion,
      vatRate: 20,
      lineTotal: l.quantity * (l.unitPrice - discount) - promotion,
    };
  });
  const net = items.reduce((a, i) => a + i.lineTotal, 0);
  const row = await prisma.order.create({
    data: {
      orderNumber: `MRG-${Date.now().toString(36)}-${orderIds.length}`,
      status: "CONFIRMED",
      companyId,
      createdById: admin.id,
      subtotal: items.reduce((a, i) => a + i.quantity * i.unitPrice, 0),
      taxTotal: net * 0.2,
      grandTotal: net * 1.2,
      items: { create: items },
    },
    select: { id: true },
  });
  orderIds.push(row.id);
}

beforeAll(async () => {
  if (!hasDb) return;
  admin = await fx.user("SUPER_ADMIN");
  companyId = await fx.company({ label: "Kârlılık" });

  priced = await fx.variant({ price: 100 });
  unpriced = await fx.variant({ price: 100 });
  await prisma.productVariant.update({
    where: { id: priced.variantId },
    data: { costPrice: 60 },
  });
  // Sıfır maliyet "girilmemiş" sayılıyor; kapsamın dışında kalması gereken
  // satır bu.
  await prisma.productVariant.update({
    where: { id: unpriced.variantId },
    data: { costPrice: 0 },
  });

  // Üç sipariş: eşiği (üç sipariş) geçsin ki firma sıralamaya girsin.
  // Her biri 10 adet × 100 ₺ liste, 5 ₺ firma + 3 ₺ hacim iskontosu (ikisi
  // `discount` içinde), üstüne 20 ₺ kampanya. Net = 10×92 − 20 = 900.
  for (let i = 0; i < 3; i += 1) {
    await order([
      {
        variantId: priced.variantId,
        quantity: 10,
        unitPrice: 100,
        discount: 8,
        volumeDiscount: 3,
        promotionDiscount: 20,
      },
    ]);
  }
});

afterAll(async () => {
  if (!hasDb) return;
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await fx.teardown();
});

suite("kârlılık bölümü", () => {
  let margin: MarginSnapshot;

  it("gecelik özet kârlılığı da hesaplıyor", async () => {
    const payload = await computeSnapshot();
    margin = payload.margin;
    expect(margin.bridge.listValue).toBeGreaterThan(0);
    await saveSnapshot(payload, 0);
  });

  it("firma iskontosu hacim payını iki kez düşmüyor", () => {
    const row = margin.byCompany.rows.find((r) => r.key === companyId);
    expect(row).toBeDefined();
    // 3 sipariş × (liste 1000, iskonto 50+30, kampanya 20) → net 2700.
    expect(row!.listValue).toBeCloseTo(3000, 2);
    expect(row!.discountTotal).toBeCloseTo(300, 2);
    expect(row!.netRevenue).toBeCloseTo(2700, 2);
    expect(row!.listValue - row!.discountTotal).toBeCloseTo(row!.netRevenue, 2);
  });

  it("marj net mal bedeli üzerinden, KDV'siz", () => {
    const row = margin.byCompany.rows.find((r) => r.key === companyId)!;
    // Maliyet 30 adet × 60 = 1800; net 2700 → %33,33. KDV dahil genel toplam
    // (3240) paydaya girseydi %44,4 çıkardı ve o sayı bir marj değil.
    expect(row.cost).toBeCloseTo(1800, 2);
    expect(row.marginPct).toBeCloseTo(33.33, 1);
  });

  it("sıfır maliyetli varyant kapsama girmiyor", async () => {
    await order([
      {
        variantId: unpriced.variantId,
        quantity: 10,
        unitPrice: 100,
      },
    ]);
    const row = (await computeSnapshot()).margin.byCompany.rows.find(
      (r) => r.key === companyId,
    )!;
    // Net 3700'e çıktı, kapsanan ciro 2700'de kaldı: %73 kapsam. Sıfır
    // maliyet "girilmiş" sayılsaydı kapsam %100 görünür, marj da o boş
    // satırın üstünden şişerdi.
    expect(row.netRevenue).toBeCloseTo(3700, 2);
    expect(row.coveredRevenue).toBeCloseTo(2700, 2);
  });

  it("uç bölümü kârlılık özetinden veriyor", async () => {
    const res = await callRoute<{
      section: string;
      live: boolean;
      data: MarginSnapshot | null;
    }>(getAnalytics, {
      url: "/api/analytics?bolum=karlilik",
      token: await bearer(admin),
    });
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.section).toBe("karlilik");
    // Gecelik özetten geliyor, canlı değil — "ne zaman hesaplandı" satırının
    // doğru olması buna bağlı.
    expect(body.live).toBe(false);
    expect(body.data?.bridge.steps.map((s) => s.key)).toEqual([
      "company",
      "volume",
      "promotion",
    ]);
  });

  it("izinsiz kullanıcı kârlılığı göremiyor", async () => {
    // Maliyet ve marj bu ekranda; `costPrice` müşteriye gösterilmiyor,
    // plasiyere de gösterilmemeli. Kapı rol değil izin (Adım 30).
    const plain = await fx.user("SUPER_ADMIN", {
      permissions: [],
      label: "izinsiz",
    });
    const res = await callRoute(getAnalytics, {
      url: "/api/analytics?bolum=karlilik",
      token: await bearer(plain),
    });
    expect(res.status).toBe(403);
  });
});
