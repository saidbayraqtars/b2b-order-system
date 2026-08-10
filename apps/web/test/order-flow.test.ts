import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { POST as postOrder, GET as getOrders } from "@/app/api/orders/route";
import { POST as postQuote } from "@/app/api/orders/quote/route";
import { POST as approveOrder } from "@/app/api/orders/[id]/approve/route";
import { POST as rejectOrder } from "@/app/api/orders/[id]/reject/route";
import { POST as changeStatus } from "@/app/api/orders/[id]/status/route";
import { POST as postCartItem } from "@/app/api/cart/items/route";
import { GET as getCart } from "@/app/api/cart/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// An order placed the way the portal places one: over HTTP, through the guard,
// with the price decided on the server.
//
// The service layer already has tests for the arithmetic. What is new here is
// everything between the button and the service — that the buyer cannot name
// its own price or vade, that approval belongs to the buying company's manager
// and no one else's, and that a cancelled order gives the stock back.

const fx = new Fixtures("orderflow");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let rep: TestUser;
let manager: TestUser;
let staff: TestUser;
let otherManager: TestUser;

let companyId: string;
let otherCompanyId: string;
let variantId: string;

const LIST_PRICE = 100;

suite("sipariş akışı (HTTP)", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    rep = await fx.user("SALES_REP");

    const groupId = await fx.group();
    companyId = await fx.company({
      customerGroupId: groupId,
      salesRepId: rep.id,
      requiresOrderApproval: true,
      creditLimit: 1_000_000,
    });
    otherCompanyId = await fx.company({
      customerGroupId: groupId,
      label: "Yabanci",
    });

    manager = await fx.user("COMPANY_ADMIN", { companyId });
    staff = await fx.user("COMPANY_STAFF", { companyId });
    otherManager = await fx.user("COMPANY_ADMIN", {
      companyId: otherCompanyId,
      label: "yabancimudur",
    });

    ({ variantId } = await fx.variant({ price: LIST_PRICE, stock: 500 }));
  });

  afterAll(() => fx.teardown());

  describe("fiyat sunucuda belirlenir", () => {
    it("önizleme liste fiyatını ve KDV'yi kendi hesaplar", async () => {
      const res = await callRoute(postQuote, {
        url: "/api/orders/quote",
        method: "POST",
        body: { companyId, items: [{ variantId, quantity: 3 }] },
        token: await bearer(staff),
      });
      expect(res.status).toBe(200);
      expect(Number(res.body.subtotal)).toBe(300);
      // %20 KDV
      expect(Number(res.body.grandTotal)).toBe(360);
    });

    it("alıcının gönderdiği navlun yok sayılır", async () => {
      // Navlun satıcı tarafının rakamı. Yok sayılmasaydı alıcı, kargo
      // kampanyasını uydurduğu bir teslim bedeliyle tetikleyebilirdi.
      const res = await callRoute(postQuote, {
        url: "/api/orders/quote",
        method: "POST",
        body: {
          companyId,
          items: [{ variantId, quantity: 1 }],
          shippingFee: 5_000,
        },
        token: await bearer(staff),
      });
      expect(res.status).toBe(200);
      expect(Number(res.body.grandTotal)).toBe(120);
    });

    it("plasiyerin navlunu geçerlidir", async () => {
      const res = await callRoute(postQuote, {
        url: "/api/orders/quote",
        method: "POST",
        body: {
          companyId,
          items: [{ variantId, quantity: 1 }],
          shippingFee: 50,
        },
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
      expect(Number(res.body.grandTotal)).toBeGreaterThan(120);
    });

    it("alıcı kendine vade yazamaz", async () => {
      const res = await callRoute(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: {
          companyId,
          items: [{ variantId, quantity: 1 }],
          paymentTermDays: 365,
        },
        token: await bearer(staff),
      });
      // Sessizce düşürülmüyor: düşürülse alıcı vadeyi aldığını sanırdı.
      expect(res.status).toBe(422);
    });

    it("boş sepet sipariş olmaz", async () => {
      const res = await callRoute(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: { companyId, items: [] },
        token: await bearer(staff),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("sipariş oluşturma", () => {
    it("onay isteyen firmada personel siparişi onaya düşer", async () => {
      const res = await callRoute(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: { companyId, items: [{ variantId, quantity: 2 }] },
        token: await bearer(staff),
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PENDING_APPROVAL");
    });

    it("sipariş verilince sepet boşalır", async () => {
      // İki sekme açık bırakan kişi aynı siparişi ikinci kez göndermesin diye;
      // temizlik sunucuda, çünkü telefon da aynı sepeti kullanıyor.
      await callRoute(postCartItem, {
        url: "/api/cart/items",
        method: "POST",
        body: { companyId, variantId, quantity: 4 },
        token: await bearer(staff),
      });
      const before = await callRoute(getCart, {
        url: `/api/cart?companyId=${companyId}`,
        token: await bearer(staff),
      });
      expect(before.body.lines.length).toBe(1);

      await callRoute(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: { companyId, items: [{ variantId, quantity: 4 }] },
        token: await bearer(staff),
      });

      const after = await callRoute(getCart, {
        url: `/api/cart?companyId=${companyId}`,
        token: await bearer(staff),
      });
      expect(after.body.lines).toEqual([]);
    });

    it("stok yetmezse 409", async () => {
      const res = await callRoute(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: { companyId, items: [{ variantId, quantity: 999_999 }] },
        token: await bearer(staff),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INSUFFICIENT_STOCK");
    });
  });

  describe("onay yalnız alan firmanın yöneticisinindir", () => {
    let orderId: string;

    beforeAll(async () => {
      const created = await callRoute(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: { companyId, items: [{ variantId, quantity: 1 }] },
        token: await bearer(staff),
      });
      orderId = created.body.orderId;
    });

    it("başka firmanın yöneticisi onaylayamaz", async () => {
      const res = await callRoute(approveOrder, {
        url: `/api/orders/${orderId}/approve`,
        method: "POST",
        params: { id: orderId },
        token: await bearer(otherManager),
      });
      expect(res.status).toBe(403);
    });

    it("siparişi giren personel kendi siparişini onaylayamaz", async () => {
      const res = await callRoute(approveOrder, {
        url: `/api/orders/${orderId}/approve`,
        method: "POST",
        params: { id: orderId },
        token: await bearer(staff),
      });
      expect(res.status).toBe(403);
    });

    it("plasiyer de onaylayamaz — onay alıcı tarafın işi", async () => {
      const res = await callRoute(approveOrder, {
        url: `/api/orders/${orderId}/approve`,
        method: "POST",
        params: { id: orderId },
        token: await bearer(rep),
      });
      expect(res.status).toBe(403);
    });

    it("kendi firmasının yöneticisi onaylar", async () => {
      const res = await callRoute(approveOrder, {
        url: `/api/orders/${orderId}/approve`,
        method: "POST",
        params: { id: orderId },
        token: await bearer(manager),
      });
      expect(res.status).toBe(200);
      expect(res.body.status).not.toBe("PENDING_APPROVAL");
    });

    it("onaylanmış siparişi yönetici bir daha onaylayamaz", async () => {
      // Bayi yöneticisinin yetkisi \"onay bekleyen\" ile sınırlı; onaylanmış bir
      // sipariş artık onun elinde değil, o yüzden cevap 403.
      const res = await callRoute(approveOrder, {
        url: `/api/orders/${orderId}/approve`,
        method: "POST",
        params: { id: orderId },
        token: await bearer(manager),
      });
      expect(res.status).toBe(403);
    });

    it("süper admin için aynı sipariş bu kez durum çatışmasıdır", async () => {
      const res = await callRoute(approveOrder, {
        url: `/api/orders/${orderId}/approve`,
        method: "POST",
        params: { id: orderId },
        token: await bearer(admin),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE");
    });

    it("olmayan sipariş 404", async () => {
      const res = await callRoute(approveOrder, {
        url: "/api/orders/cly000000000000000000000/approve",
        method: "POST",
        params: { id: "cly000000000000000000000" },
        token: await bearer(admin),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("ret ve iptal", () => {
    it("reddedilen sipariş REJECTED olur", async () => {
      const created = await callRoute(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: { companyId, items: [{ variantId, quantity: 1 }] },
        token: await bearer(staff),
      });
      const orderId = created.body.orderId;

      const res = await callRoute(rejectOrder, {
        url: `/api/orders/${orderId}/reject`,
        method: "POST",
        params: { id: orderId },
        token: await bearer(manager),
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("REJECTED");
    });

    it("iptal stoğu geri verir ve cari borcu ters kayıtla kapatır", async () => {
      const stockBefore = await stockOf(variantId);
      const balanceBefore = await balanceOf(companyId);

      const created = await callRoute(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: { companyId, items: [{ variantId, quantity: 5 }] },
        token: await bearer(rep),
      });
      expect(created.status).toBe(201);
      const orderId = created.body.orderId;

      expect(await stockOf(variantId)).toBe(stockBefore - 5);

      const cancelled = await callRoute(changeStatus, {
        url: `/api/orders/${orderId}/status`,
        method: "POST",
        params: { id: orderId },
        body: { status: "CANCELLED", note: "test iptali" },
        token: await bearer(admin),
      });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe("CANCELLED");

      expect(await stockOf(variantId)).toBe(stockBefore);
      // Silme değil ters kayıt: ekstrede iki satır da durur.
      expect(await balanceOf(companyId)).toBe(balanceBefore);
    });

    it("bayi personeli sipariş durumunu değiştiremez", async () => {
      const created = await callRoute(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: { companyId, items: [{ variantId, quantity: 1 }] },
        token: await bearer(rep),
      });
      const orderId = created.body.orderId;

      const res = await callRoute(changeStatus, {
        url: `/api/orders/${orderId}/status`,
        method: "POST",
        params: { id: orderId },
        body: { status: "CANCELLED" },
        token: await bearer(staff),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("listeleme", () => {
    it("bayi personeli yalnız kendi firmasının siparişlerini görür", async () => {
      const res = await callRoute(getOrders, {
        url: "/api/orders",
        token: await bearer(staff),
      });
      expect(res.status).toBe(200);
      const companies = new Set(
        res.body.orders.map((o: { company: { id: string } }) => o.company.id),
      );
      expect([...companies]).toEqual([companyId]);
    });

    it("duruma göre süzülür", async () => {
      const res = await callRoute(getOrders, {
        url: "/api/orders?status=CANCELLED",
        token: await bearer(staff),
      });
      expect(res.status).toBe(200);
      for (const o of res.body.orders as Array<{ status: string }>) {
        expect(o.status).toBe("CANCELLED");
      }
    });
  });
});

async function stockOf(id: string): Promise<number> {
  const v = await prisma.productVariant.findUniqueOrThrow({
    where: { id },
    select: { stock: true },
  });
  return v.stock;
}

async function balanceOf(id: string): Promise<number> {
  const c = await prisma.company.findUniqueOrThrow({
    where: { id },
    select: { currentBalance: true },
  });
  return Number(c.currentBalance);
}
