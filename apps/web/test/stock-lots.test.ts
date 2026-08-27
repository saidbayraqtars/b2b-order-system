import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  GET as getLots,
  POST as postLot,
} from "@/app/api/admin/stock-lots/route";
import { PATCH as patchLot } from "@/app/api/admin/stock-lots/[id]/route";
import { POST as writeOffLot } from "@/app/api/admin/stock-lots/[id]/write-off/route";
import { POST as postOrder } from "@/app/api/orders/route";
import { POST as postQuote } from "@/app/api/orders/quote/route";
import { POST as changeStatus } from "@/app/api/orders/[id]/status/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Parti (lot), son kullanma tarihi ve çift birim — gıda kurulumunun iki ayağı.
//
// Buradaki testlerin hepsi tek bir soruyu farklı yerlerden soruyor: **partiyi
// insan mı seçiyor, sistem mi?** Cevap sistem olmalı. İnsan seçerse SKT'si
// yakın mal depoda kalır, ve o mal bir gün fire olarak geri gelir.

const fx = new Fixtures("lots");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let viewer: TestUser;
let manager: TestUser;
let companyId: string;

/** Bugünden `days` gün sonrası, ISO gün biçiminde. */
/**
 * `yyyy-mm-dd`, **yerel** takvimden.
 *
 * `toISOString()` yazıyordu ve o UTC'ye çeviriyor: Türkiye'de gece yarısı ile
 * 03:00 arasında koşan test bir önceki günü gönderiyor, servis ise günü yerel
 * gece yarısına indiriyordu. Raf ömrü testi yalnızca o üç saatte kırılıyordu —
 * ürün hatası değil, testin kendi saat dilimi hatası.
 */
function isoDay(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

async function createLot(
  variantId: string,
  code: string,
  expiryDate: string,
  quantity: number,
): Promise<string> {
  const res = await callRoute(postLot, {
    method: "POST",
    token: await bearer(admin),
    body: { variantId, code, expiryDate, quantity },
  });
  expect(res.status).toBe(201);
  return res.body.lotId as string;
}

suite("parti, SKT ve çift birim (HTTP)", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    // Yalnızca okuma yetkisi: mal kabul edememeli.
    viewer = await fx.user("SUPER_ADMIN", {
      permissions: ["stock.view"],
      label: "stokokur",
    });

    const groupId = await fx.group();
    companyId = await fx.company({ customerGroupId: groupId, creditLimit: 5_000_000 });
    manager = await fx.user("COMPANY_ADMIN", { companyId });
  });

  afterAll(async () => {
    await fx.teardown();
  });

  // ── mal kabul ──

  it("mal kabul partiyi açar ve stoku defterle birlikte artırır", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true });

    const res = await callRoute(postLot, {
      method: "POST",
      token: await bearer(admin),
      body: { variantId, code: "L-100", expiryDate: isoDay(60), quantity: 40 },
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.balance).toBe(40);

    const lot = await prisma.stockLot.findUnique({
      where: { id: res.body.lotId },
      select: { onHand: true, code: true },
    });
    expect(lot?.onHand).toBe(40);

    // Defter satırı da parti taşıyor — "hangi mal ne zaman girdi" oradan okunur.
    const movement = await prisma.stockMovement.findFirst({
      where: { variantId, lotId: res.body.lotId },
      select: { direction: true, quantity: true, source: true },
    });
    expect(movement).toMatchObject({ direction: "IN", quantity: 40, source: "MANUAL" });
  });

  it("aynı parti koduna ikinci giriş yeni parti açmaz, üstüne ekler", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true });
    const lotId = await createLot(variantId, "L-200", isoDay(90), 10);

    const second = await callRoute(postLot, {
      method: "POST",
      token: await bearer(admin),
      body: { variantId, code: "L-200", quantity: 15 },
    });

    expect(second.status).toBe(201);
    expect(second.body.created).toBe(false);
    expect(second.body.lotId).toBe(lotId);

    const lot = await prisma.stockLot.findUnique({
      where: { id: lotId },
      select: { onHand: true },
    });
    expect(lot?.onHand).toBe(25);
  });

  it("SKT boşsa raf ömründen hesaplanır", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true });
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { shelfLifeDays: 30 },
    });

    const res = await callRoute(postLot, {
      method: "POST",
      token: await bearer(admin),
      body: { variantId, code: "L-RAF", producedAt: isoDay(0), quantity: 5 },
    });

    expect(res.status).toBe(201);
    // Servis günü yerel gece yarısına indiriyor; ISO metni UTC'ye çevirdiği
    // için karşılaştırma da yerel tarih üzerinden yapılıyor.
    const expiry = new Date(res.body.expiryDate as string);
    const expected = new Date();
    expected.setDate(expected.getDate() + 30);
    expect(expiry.getDate()).toBe(expected.getDate());
    expect(expiry.getMonth()).toBe(expected.getMonth());
  });

  it("stock.manage olmayan kullanıcı mal kabul edemez", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true });

    const res = await callRoute(postLot, {
      method: "POST",
      token: await bearer(viewer),
      body: { variantId, code: "L-YOK", quantity: 5 },
    });

    expect(res.status).toBe(403);
  });

  // ── FEFO ──

  it("sipariş malı SKT'si en yakın partiden düşer", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true, price: 10 });
    // Uzak parti önce giriyor: FIFO olsaydı bu düşerdi, FEFO'da düşmez.
    const uzak = await createLot(variantId, "L-UZAK", isoDay(120), 30);
    const yakin = await createLot(variantId, "L-YAKIN", isoDay(10), 12);

    const order = await callRoute(postOrder, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 20 }],
      },
    });
    expect(order.status).toBe(201);

    const yakinRow = await prisma.stockLot.findUnique({
      where: { id: yakin },
      select: { onHand: true },
    });
    const uzakRow = await prisma.stockLot.findUnique({
      where: { id: uzak },
      select: { onHand: true },
    });

    // 12 yakından, kalan 8 uzaktan.
    expect(yakinRow?.onHand).toBe(0);
    expect(uzakRow?.onHand).toBe(22);

    // Ve defterde iki ayrı çıkış satırı var — tek satır olsaydı hangi SKT'li
    // malın gittiği kaybolurdu.
    const outs = await prisma.stockMovement.findMany({
      where: { variantId, source: "ORDER", direction: "OUT" },
      select: { quantity: true, lotId: true },
    });
    expect(outs).toHaveLength(2);
    expect(outs.map((o) => o.quantity).sort((a, b) => a - b)).toEqual([8, 12]);
  });

  it("SKT'si geçmiş ve bloke partiler FEFO sırasına girmez", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true, price: 10 });
    const gecmis = await createLot(variantId, "L-GECMIS", isoDay(-5), 50);
    const bloke = await createLot(variantId, "L-BLOKE", isoDay(3), 50);
    const saglam = await createLot(variantId, "L-SAGLAM", isoDay(200), 50);

    const blocked = await callRoute(patchLot, {
      method: "PATCH",
      token: await bearer(admin),
      params: { id: bloke },
      body: { isBlocked: true },
    });
    expect(blocked.status).toBe(200);

    const order = await callRoute(postOrder, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 10 }],
      },
    });
    expect(order.status).toBe(201);

    const rows = await prisma.stockLot.findMany({
      where: { id: { in: [gecmis, bloke, saglam] } },
      select: { id: true, onHand: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r.onHand]));
    expect(byId.get(gecmis)).toBe(50); // dokunulmadı
    expect(byId.get(bloke)).toBe(50); // dokunulmadı
    expect(byId.get(saglam)).toBe(40); // mal buradan çıktı
  });

  it("sipariş iptali malı çıktığı partiye geri verir", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true, price: 10 });
    const yakin = await createLot(variantId, "L-IPTAL-1", isoDay(15), 5);
    const uzak = await createLot(variantId, "L-IPTAL-2", isoDay(150), 20);

    const order = await callRoute(postOrder, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 9 }],
      },
    });
    expect(order.status).toBe(201);

    const cancelled = await callRoute(changeStatus, {
      method: "POST",
      token: await bearer(admin),
      params: { id: order.body.orderId },
      body: { status: "CANCELLED" },
    });
    expect(cancelled.status).toBe(200);

    const rows = await prisma.stockLot.findMany({
      where: { id: { in: [yakin, uzak] } },
      select: { id: true, onHand: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r.onHand]));
    // Başladığı yere döndü: 5 + 20.
    expect(byId.get(yakin)).toBe(5);
    expect(byId.get(uzak)).toBe(20);

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true },
    });
    expect(variant?.stock).toBe(25);
  });

  it("parti takibi kapalı kalemde sipariş ve iptal eskisi gibi çalışır", async () => {
    const { variantId } = await fx.variant({ stock: 100, price: 10 });

    const order = await callRoute(postOrder, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 30 }],
      },
    });
    expect(order.status).toBe(201);

    let variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true },
    });
    expect(variant?.stock).toBe(70);

    await callRoute(changeStatus, {
      method: "POST",
      token: await bearer(admin),
      params: { id: order.body.orderId },
      body: { status: "CANCELLED" },
    });

    variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true },
    });
    expect(variant?.stock).toBe(100);
  });

  // ── fire ──

  it("fire partiyi ve toplamı düşürür, gerekçesiyle defterde durur", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true });
    const lotId = await createLot(variantId, "L-FIRE", isoDay(-1), 18);

    const res = await callRoute(writeOffLot, {
      method: "POST",
      token: await bearer(admin),
      params: { id: lotId },
      body: { quantity: 18, reason: "SKT geçti" },
    });

    expect(res.status).toBe(201);
    expect(res.body.lotOnHand).toBe(0);
    expect(res.body.balance).toBe(0);

    const movement = await prisma.stockMovement.findFirst({
      where: { lotId, direction: "OUT" },
      select: { source: true, description: true },
    });
    expect(movement?.source).toBe("MANUAL");
    expect(movement?.description).toContain("SKT geçti");
  });

  it("partide olmayan adet fire edilemez", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true });
    const lotId = await createLot(variantId, "L-AZ", isoDay(30), 3);

    const res = await callRoute(writeOffLot, {
      method: "POST",
      token: await bearer(admin),
      params: { id: lotId },
      body: { quantity: 10, reason: "deneme" },
    });

    expect(res.status).toBe(422);
  });

  // ── liste & özet ──

  it("liste SKT sırasına dizilir ve özet bozulan malı sayar", async () => {
    const { variantId } = await fx.variant({ stock: 0, tracksLots: true });
    await createLot(variantId, "L-S3", isoDay(300), 4);
    await createLot(variantId, "L-S1", isoDay(-2), 4);
    await createLot(variantId, "L-S2", isoDay(9), 4);

    const res = await callRoute(getLots, {
      url: `/api/admin/stock-lots?variantId=${variantId}`,
      token: await bearer(admin),
    });

    expect(res.status).toBe(200);
    expect(res.body.lots.map((l: { code: string }) => l.code)).toEqual([
      "L-S1",
      "L-S2",
      "L-S3",
    ]);
    expect(res.body.lots[0].state).toBe("EXPIRED");
    expect(res.body.lots[1].state).toBe("WARNING");
    expect(res.body.lots[2].state).toBe("OK");
    expect(res.body.summary.expiredLots).toBeGreaterThanOrEqual(1);
  });

  // ── çift birim ──

  it("kasa/kg: fiyat çarpanla satış birimine çevrilir", async () => {
    // 1 kasa = 12,5 kg, kg fiyatı 40 ₺ → kasa 500 ₺.
    const { variantId } = await fx.variant({
      stock: 100,
      price: 40,
      pricingUnit: "KG",
      unitFactor: 12.5,
    });

    const res = await callRoute(postQuote, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 2 }],
      },
    });

    expect(res.status).toBe(200);
    const line = res.body.lines[0];
    expect(line.unitPrice).toBe("500.00");
    // Belgeye basılacak olan kg fiyatı: çarpan uygulanmamış hâli.
    expect(line.listUnitPrice).toBe("40.00");
    expect(res.body.subtotal).toBe("1000.00");
  });

  it("çift birim künyesi sipariş satırına donar", async () => {
    const { variantId } = await fx.variant({
      stock: 100,
      price: 40,
      pricingUnit: "KG",
      unitFactor: 12.5,
    });

    const order = await callRoute(postOrder, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 1 }],
      },
    });
    expect(order.status).toBe(201);

    const item = await prisma.orderItem.findFirst({
      where: { orderId: order.body.orderId },
      select: { pricingUnit: true, unitFactor: true, unitPrice: true },
    });
    expect(item?.pricingUnit).toBe("KG");
    expect(Number(item?.unitFactor)).toBe(12.5);
    expect(Number(item?.unitPrice)).toBe(500);
  });
});
