import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { GET as getCatalog } from "@/app/api/catalog/route";
import { POST as postOrder } from "@/app/api/orders/route";
import { POST as postQuote } from "@/app/api/orders/quote/route";
import {
  DELETE as deleteUnit,
  PATCH as patchUnit,
} from "@/app/api/admin/variant-units/[id]/route";
import { GET as listUnits, POST as postUnit } from "@/app/api/admin/variants/[id]/units/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Çoklu birim (F2) rotaları: paket birimi yönetimi, katalog, teklif ve sipariş.
//
// Servis testleri hesabı kanıtlıyor; burada sorulan, rotaların kapısı ve
// sözleşmesi: yalnız ürün yöneticisi birim açar, çarpan ve paket sayısı JSON'da
// sayıdır (harness her yanıtı tarar), teklif paket künyesini döndürür.

const fx = new Fixtures("birim");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let manager: TestUser;
let companyId: string;
let variantId: string;
let productId: string;

suite("çoklu birim rotaları", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    const groupId = await fx.group();
    companyId = await fx.company({ customerGroupId: groupId, creditLimit: 5_000_000 });
    manager = await fx.user("COMPANY_ADMIN", { companyId });
    ({ variantId, productId } = await fx.variant({ price: 9, stock: 500 }));
  });

  afterAll(() => fx.teardown());

  let koliId: string;

  it("yönetici koli açıyor; çarpan sayı, ad büyük harf", async () => {
    const res = await callRoute(postUnit, {
      method: "POST",
      token: await bearer(admin),
      params: { id: variantId },
      body: { name: "koli", factor: 12, price: 100 },
    });
    expect(res.status).toBe(201);
    expect(res.body.unit).toMatchObject({ name: "KOLİ", factor: 12, price: "100.00" });
    koliId = res.body.unit.id;

    const list = await callRoute(listUnits, {
      token: await bearer(admin),
      params: { id: variantId },
    });
    expect(list.body.units.map((u: { name: string }) => u.name)).toEqual(["KOLİ"]);
  });

  it("alıcı birim açamıyor; aynı ad ikinci kez açılmıyor", async () => {
    const buyer = await callRoute(postUnit, {
      method: "POST",
      token: await bearer(manager),
      params: { id: variantId },
      body: { name: "PALET", factor: 120 },
    });
    expect(buyer.status).toBe(403);

    const dup = await callRoute(postUnit, {
      method: "POST",
      token: await bearer(admin),
      params: { id: variantId },
      body: { name: "Koli", factor: 6 },
    });
    expect(dup.status).toBe(409);
  });

  it("katalog paketi bir koli fiyatıyla gösteriyor", async () => {
    const res = await callRoute(getCatalog, {
      url: `/api/catalog?companyId=${companyId}`,
      token: await bearer(manager),
    });
    expect(res.status).toBe(200);
    const product = res.body.products.find((p: { id: string }) => p.id === productId);
    expect(product.variants[0].units).toEqual([
      expect.objectContaining({ name: "KOLİ", factor: 12, netUnitPrice: "100.00" }),
    ]);
  });

  it("teklif ve sipariş paket künyesini taşıyor; yarım koli reddediliyor", async () => {
    const quote = await callRoute(postQuote, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 24, unitId: koliId }],
      },
    });
    expect(quote.status).toBe(200);
    expect(quote.body.lines[0].unit).toMatchObject({
      name: "KOLİ",
      factor: 12,
      count: 2,
      unitPrice: "100.00",
    });
    expect(quote.body.lines[0].lineNet).toBe("200.00");

    const half = await callRoute(postQuote, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 18, unitId: koliId }],
      },
    });
    expect(half.status).toBe(422);

    const order = await callRoute(postOrder, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 24, unitId: koliId }],
      },
    });
    expect(order.status).toBe(201);
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.body.orderId },
    });
    expect(item.unitName).toBe("KOLİ");
  });

  it("fiyat kaldırılıyor, birim siliniyor", async () => {
    const patched = await callRoute(patchUnit, {
      method: "PATCH",
      token: await bearer(admin),
      params: { id: koliId },
      body: { price: null },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.unit.price).toBeNull();

    const removed = await callRoute(deleteUnit, {
      method: "DELETE",
      token: await bearer(admin),
      params: { id: koliId },
    });
    expect(removed.status).toBe(204);
  });
});
