import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { invalidateModuleCache, setModuleEnabled } from "@repo/services";
import { POST as postQuote } from "@/app/api/orders/quote/route";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { GET as getCart } from "@/app/api/cart/route";
import { GET as getPaymentOptions } from "@/app/api/payment-options/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// D5 · sepet, HTTP sınırından. Panel sadeleşirken sunucunun üç sözüne dayandı:
// - Kampanya modülü kapalıyken her kupon geçersiz (422). Panel o hâlde kupon
//   kutusunu hiç çizmiyor; çizseydi müşteri her denemede hata alırdı.
// - Tek ödeme yöntemine sınırlı firmada seçenek listesi tek satır. Panel açılır
//   liste yerine bilgi satırı gösteriyor.
// - Miktar kutusu artık her satırda yazılabiliyor. İstemci yazılanı koli katına
//   oturtuyor ama son söz sunucuda: koli katı olmayan miktar siparişe gitmiyor.

const fx = new Fixtures("sepet");
const suite = hasDb ? describe : describe.skip;

let buyer: TestUser;
let companyId: string;
let variantId: string;
let kampanyaBefore: { enabled: boolean } | null = null;

suite("sepet (HTTP)", () => {
  beforeAll(async () => {
    kampanyaBefore = await prisma.installationModule.findUnique({
      where: { key: "kampanya" },
      select: { enabled: true },
    });
    const groupId = await fx.group();
    companyId = await fx.company({ customerGroupId: groupId });
    buyer = await fx.user("COMPANY_ADMIN", { companyId });
    ({ variantId } = await fx.variant({
      customerGroupId: groupId,
      price: 10,
      stock: 1_000,
      unitsPerCase: 25,
      moqUnits: 25,
    }));
  });

  afterAll(async () => {
    await prisma.installationModule.deleteMany({ where: { key: "kampanya" } });
    if (kampanyaBefore)
      await prisma.installationModule.create({
        data: { key: "kampanya", ...kampanyaBefore },
      });
    invalidateModuleCache();
    await fx.teardown();
  });

  it("kampanya modülü kapalıyken kupon geçersiz (422)", async () => {
    await setModuleEnabled("kampanya", false);
    invalidateModuleCache();
    try {
      const res = await callRoute(postQuote, {
        url: "/api/orders/quote",
        method: "POST",
        token: await bearer(buyer),
        body: {
          companyId,
          couponCode: "KUPON25",
          items: [{ variantId, quantity: 25 }],
        },
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("COUPON_INVALID");
    } finally {
      await setModuleEnabled("kampanya", true);
      invalidateModuleCache();
    }
  });

  it("tek yönteme sınırlı firmada ödeme seçeneği tek satır", async () => {
    await prisma.company.update({
      where: { id: companyId },
      data: { allowedPaymentMethods: ["BANK_TRANSFER"] },
    });
    try {
      const res = await callRoute(getPaymentOptions, {
        url: `/api/payment-options?companyId=${companyId}`,
        token: await bearer(buyer),
      });
      expect(res.status).toBe(200);
      expect(res.body.methods).toHaveLength(1);
      expect(res.body.methods[0].value).toBe("BANK_TRANSFER");
    } finally {
      await prisma.company.update({
        where: { id: companyId },
        data: { allowedPaymentMethods: [] },
      });
    }
  });

  it("sepete yazılan miktar taban birimde, satır tek", async () => {
    const token = await bearer(buyer);
    for (const quantity of [25, 500]) {
      const res = await callRoute(postCartItem, {
        url: "/api/cart/items",
        method: "POST",
        token,
        body: { companyId, variantId, quantity },
      });
      expect(res.status).toBe(200);
    }
    const cart = await callRoute(getCart, {
      url: `/api/cart?companyId=${companyId}`,
      token,
    });
    expect(cart.body.lines).toHaveLength(1);
    expect(cart.body.lines[0].quantity).toBe(500);
  });

  it("koli katı olmayan miktar siparişe gitmez", async () => {
    const res = await callRoute(postQuote, {
      url: "/api/orders/quote",
      method: "POST",
      token: await bearer(buyer),
      body: { companyId, items: [{ variantId, quantity: 30 }] },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
