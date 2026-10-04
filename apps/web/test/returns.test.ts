import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { POST as postOrder } from "@/app/api/orders/route";
import { POST as changeStatus } from "@/app/api/orders/[id]/status/route";
import { GET as getReturnable } from "@/app/api/orders/[id]/returnable/route";
import { GET as listReturns, POST as postReturn } from "@/app/api/returns/route";
import {
  GET as getReturn,
  POST as actOnReturn,
} from "@/app/api/returns/[id]/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// İade (RMA), uçtan uca.
//
// İki şeyi ayrı tutmak bu belgenin bütün varlık sebebi ve testin de:
//  1. **Kabul bir söz, teslim almak bir olay.** Stok ve cari yalnızca mal
//     gerçekten geldiğinde oynuyor; kabul edilmiş ama gelmemiş mal satılabilir
//     görünmemeli.
//  2. **Karar satıcının.** Alıcı talep açar ve vazgeçer; kabul, ret ve teslim
//     alma `returns.manage` istiyor. Aksi hâlde müşteri kendi iadesini
//     onaylayıp kendine alacak yazdırırdı.

const fx = new Fixtures("rma");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let rep: TestUser;
let manager: TestUser;
let outsider: TestUser;

let companyId: string;
let otherCompanyId: string;
let variantId: string;

const LIST_PRICE = 100;

/** Varyantın anlık stoğu. */
async function stockOf(id: string): Promise<number> {
  const row = await prisma.productVariant.findUnique({
    where: { id },
    select: { stock: true },
  });
  return Number(row!.stock);
}

async function balanceOf(id: string): Promise<number> {
  const row = await prisma.company.findUnique({
    where: { id },
    select: { currentBalance: true },
  });
  return Number(row!.currentBalance);
}

/** Sipariş aç ve sevk et — iadenin ön koşulu. */
async function shippedOrder(
  quantity = 5,
  target = companyId,
): Promise<{ orderId: string; orderItemId: string }> {
  const created = await callRoute<{ orderId: string }>(postOrder, {
    url: "/api/orders",
    method: "POST",
    body: { companyId: target, items: [{ variantId, quantity }] },
    token: await bearer(admin),
  });
  expect(created.status).toBe(201);
  const orderId = created.body.orderId;

  for (const status of ["PROCESSING", "SHIPPED"]) {
    const moved = await callRoute(changeStatus, {
      url: `/api/orders/${orderId}/status`,
      method: "POST",
      params: { id: orderId },
      body: { status },
      token: await bearer(admin),
    });
    expect(moved.status).toBe(200);
  }

  const item = await prisma.orderItem.findFirst({
    where: { orderId },
    select: { id: true },
  });
  return { orderId, orderItemId: item!.id };
}

/** Talep aç (varsayılan olarak alıcı firmanın yöneticisi adına). */
async function requestReturn(
  orderItemId: string,
  orderId: string,
  options: {
    quantity?: number;
    as?: TestUser;
    condition?: "RESELLABLE" | "DAMAGED";
  } = {},
): Promise<{ status: number; body: any }> {
  return callRoute(postReturn, {
    url: "/api/returns",
    method: "POST",
    body: {
      orderId,
      reason: "Ürün müşteriye uymadı",
      items: [
        {
          orderItemId,
          quantity: options.quantity ?? 2,
          ...(options.condition ? { condition: options.condition } : {}),
        },
      ],
    },
    token: await bearer(options.as ?? manager),
  });
}

/** Talebi ilerlet. */
async function act(
  returnId: string,
  body: Record<string, unknown>,
  as: TestUser = admin,
): Promise<{ status: number; body: any }> {
  return callRoute(actOnReturn, {
    url: `/api/returns/${returnId}`,
    method: "POST",
    params: { id: returnId },
    body,
    token: await bearer(as),
  });
}

suite("iade / RMA (HTTP)", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    rep = await fx.user("SALES_REP");

    const groupId = await fx.group();
    companyId = await fx.company({
      customerGroupId: groupId,
      salesRepId: rep.id,
      creditLimit: 1_000_000,
    });
    otherCompanyId = await fx.company({
      customerGroupId: groupId,
      label: "Yabanci",
    });

    manager = await fx.user("COMPANY_ADMIN", { companyId });
    outsider = await fx.user("COMPANY_ADMIN", {
      companyId: otherCompanyId,
      label: "yabancimudur",
    });

    ({ variantId } = await fx.variant({ price: LIST_PRICE, stock: 500 }));
  });

  afterAll(() => fx.teardown());

  describe("ne iade edilebilir", () => {
    it("sevk edilmemiş sipariş iade edilemez — o iş iptaldir", async () => {
      const created = await callRoute<{ orderId: string }>(postOrder, {
        url: "/api/orders",
        method: "POST",
        body: { companyId, items: [{ variantId, quantity: 2 }] },
        token: await bearer(admin),
      });
      const orderId = created.body.orderId;

      const res = await callRoute(getReturnable, {
        url: `/api/orders/${orderId}/returnable`,
        params: { id: orderId },
        token: await bearer(manager),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE");
    });

    it("sevk edilen siparişin satırları iade edilebilir görünür", async () => {
      const { orderId } = await shippedOrder(4);

      const res = await callRoute<
        { lines: Array<{ quantityShipped: number; returnableQuantity: number }> },
        { id: string }
      >(getReturnable, {
        url: `/api/orders/${orderId}/returnable`,
        params: { id: orderId },
        token: await bearer(manager),
      });

      expect(res.status).toBe(200);
      expect(res.body.lines).toHaveLength(1);
      // İrsaliye kesilmeyen kurulumda `quantityShipped` boş kalıyor; sıfırı üst
      // sınır saymak iadeyi bütünüyle imkânsız kılardı, siparişin kendi adedi
      // devreye giriyor.
      expect(res.body.lines[0]!.returnableQuantity).toBe(4);
    });

    it("açık talep hakkı tüketir, reddedilen talep geri verir", async () => {
      const { orderId, orderItemId } = await shippedOrder(6);
      const opened = await requestReturn(orderItemId, orderId, { quantity: 2 });
      expect(opened.status).toBe(201);

      const readLines = async () => {
        const res = await callRoute<
          { lines: Array<{ returnableQuantity: number }> },
          { id: string }
        >(getReturnable, {
          url: `/api/orders/${orderId}/returnable`,
          params: { id: orderId },
          token: await bearer(admin),
        });
        return res.body.lines[0]!.returnableQuantity;
      };

      expect(await readLines()).toBe(4);

      const rejected = await act(opened.body.return.id, {
        status: "REJECTED",
        note: "Ambalaj açılmış",
      });
      expect(rejected.status).toBe(200);
      // Reddedilen talep hakkı geri verir: müşteri düzeltip yeniden açabilmeli.
      expect(await readLines()).toBe(6);
    });
  });

  describe("talep açma", () => {
    it("alıcı kendi siparişi için talep açar", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const res = await requestReturn(orderItemId, orderId, { quantity: 2 });

      expect(res.status).toBe(201);
      expect(res.body.return.status).toBe("REQUESTED");
      expect(res.body.return.rmaNumber).toBeTruthy();
      expect(res.body.return.items).toHaveLength(1);
      expect(res.body.return.items[0]!.quantity).toBe(2);
    });

    it("gerekçesiz talep kabul edilmiyor", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const res = await callRoute(postReturn, {
        url: "/api/returns",
        method: "POST",
        body: { orderId, reason: "", items: [{ orderItemId, quantity: 1 }] },
        token: await bearer(manager),
      });
      // Gerekçesiz talep, karar verecek kişiye hiçbir şey söylemez.
      expect(res.status).toBe(400);
    });

    it("sevk edilenden fazlası talep edilemez", async () => {
      const { orderId, orderItemId } = await shippedOrder(3);
      const res = await requestReturn(orderItemId, orderId, { quantity: 4 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("OVER_RETURN");
    });

    it("başka firmanın siparişi için talep açılamıyor", async () => {
      const { orderId, orderItemId } = await shippedOrder(2);
      const res = await requestReturn(orderItemId, orderId, { as: outsider });
      // Kapsam dışındaki sipariş "yok" görünüyor; başkasının belgesinin
      // varlığı bile sızmamalı.
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ORDER_NOT_FOUND");
    });
  });

  describe("karar satıcının", () => {
    it("alıcı kendi talebini onaylayamaz", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId);

      const res = await act(opened.body.return.id, { status: "APPROVED" }, manager);
      expect(res.status).toBe(403);
    });

    it("alıcı kendi talebinden vazgeçebilir", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId);

      const res = await act(opened.body.return.id, { status: "CANCELLED" }, manager);
      expect(res.status).toBe(200);
      expect(res.body.return.status).toBe("CANCELLED");
    });

    it("kabul mal getirmiyor: stok ve cari kıpırdamıyor", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId, { quantity: 2 });

      const stockBefore = await stockOf(variantId);
      const balanceBefore = await balanceOf(companyId);

      const res = await act(opened.body.return.id, { status: "APPROVED" });
      expect(res.status).toBe(200);
      expect(res.body.return.status).toBe("APPROVED");

      // Kabul edildiği anda stok artsaydı, yola çıkmamış mal satılabilir
      // görünürdü.
      expect(await stockOf(variantId)).toBe(stockBefore);
      expect(await balanceOf(companyId)).toBe(balanceBefore);
    });

    it("kabul edilmeden teslim alınamaz", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId);

      const res = await act(opened.body.return.id, { status: "RECEIVED" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_RETURN_TRANSITION");
    });

    it("ret gerekçesiz olmuyor", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId);

      const res = await act(opened.body.return.id, { status: "REJECTED" });
      expect(res.status).toBe(400);
    });
  });

  describe("teslim alma — defterin oynadığı tek adım", () => {
    it("sağlam mal stoka girer ve bedeli cariye alacak yazılır", async () => {
      const { orderId, orderItemId } = await shippedOrder(5);
      const opened = await requestReturn(orderItemId, orderId, { quantity: 2 });
      await act(opened.body.return.id, { status: "APPROVED" });

      const stockBefore = await stockOf(variantId);
      const balanceBefore = await balanceOf(companyId);

      const res = await act(opened.body.return.id, { status: "RECEIVED" });
      expect(res.status).toBe(200);
      expect(res.body.return.status).toBe("RECEIVED");

      expect(await stockOf(variantId)).toBe(stockBefore + 2);
      // 2 × 100 + %20 KDV
      expect(Number(res.body.return.refundTotal)).toBe(240);
      expect(await balanceOf(companyId)).toBe(balanceBefore - 240);

      // Stok defterine kendi sebebiyle giriyor: "sipariş iptali" değil, iade.
      const movement = await prisma.stockMovement.findFirst({
        where: { orderId, source: "RETURN" },
        select: { direction: true, quantity: true, lotId: true },
      });
      expect(movement?.direction).toBe("IN");
      expect(Number(movement?.quantity)).toBe(2);
      // Geri gelen kutunun hangi partiden çıktığını kimse bilmiyor.
      expect(movement?.lotId).toBeNull();

      expect(res.body.return.creditTransactionId).toBeTruthy();
    });

    it("hasarlı mal stoka girmez ama bedeli yine alacak yazılır", async () => {
      const { orderId, orderItemId } = await shippedOrder(4);
      const opened = await requestReturn(orderItemId, orderId, { quantity: 1 });
      await act(opened.body.return.id, { status: "APPROVED" });

      const stockBefore = await stockOf(variantId);
      const balanceBefore = await balanceOf(companyId);

      const res = await act(opened.body.return.id, {
        status: "RECEIVED",
        items: [
          {
            returnItemId: opened.body.return.items[0]!.id,
            quantity: 1,
            condition: "DAMAGED",
          },
        ],
      });
      expect(res.status).toBe(200);

      // Kırık olması bizimle kargonun arasındaki mesele; müşteri malı iade etti.
      expect(await stockOf(variantId)).toBe(stockBefore);
      expect(await balanceOf(companyId)).toBe(balanceBefore - 120);
    });

    it("eksik gelen adet tutarı düşürür", async () => {
      const { orderId, orderItemId } = await shippedOrder(5);
      const opened = await requestReturn(orderItemId, orderId, { quantity: 3 });
      await act(opened.body.return.id, { status: "APPROVED" });

      const stockBefore = await stockOf(variantId);

      // Üç koli istenmiş, ikisi gelmiş: yazılan şey gelen.
      const res = await act(opened.body.return.id, {
        status: "RECEIVED",
        items: [{ returnItemId: opened.body.return.items[0]!.id, quantity: 2 }],
      });
      expect(res.status).toBe(200);
      expect(await stockOf(variantId)).toBe(stockBefore + 2);
      expect(Number(res.body.return.refundTotal)).toBe(240);
    });

    it("talep edilenden fazlası teslim alınamaz", async () => {
      const { orderId, orderItemId } = await shippedOrder(5);
      const opened = await requestReturn(orderItemId, orderId, { quantity: 2 });
      await act(opened.body.return.id, { status: "APPROVED" });

      const res = await act(opened.body.return.id, {
        status: "RECEIVED",
        items: [{ returnItemId: opened.body.return.items[0]!.id, quantity: 3 }],
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("OVER_RETURN");
    });

    it("talepte olmayan satır teslim alırken eklenemiyor", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId);
      await act(opened.body.return.id, { status: "APPROVED" });

      const other = await shippedOrder();
      const otherReturn = await requestReturn(other.orderItemId, other.orderId);

      const res = await act(opened.body.return.id, {
        status: "RECEIVED",
        items: [
          { returnItemId: otherReturn.body.return.items[0]!.id, quantity: 1 },
        ],
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("RETURN_ITEM_NOT_FOUND");
    });

    it("teslim alınmış talep bir daha hareket etmiyor", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId, { quantity: 1 });
      await act(opened.body.return.id, { status: "APPROVED" });
      await act(opened.body.return.id, { status: "RECEIVED" });

      const res = await act(opened.body.return.id, {
        status: "CANCELLED",
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_RETURN_TRANSITION");
    });
  });

  describe("kapsam", () => {
    it("bayi yalnızca kendi firmasının taleplerini görüyor", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId);

      const mine = await callRoute<{ returns: Array<{ id: string }> }>(
        listReturns,
        { url: "/api/returns", token: await bearer(manager) },
      );
      expect(mine.body.returns.some((r) => r.id === opened.body.return.id)).toBe(
        true,
      );

      const theirs = await callRoute<{ returns: Array<{ id: string }> }>(
        listReturns,
        { url: "/api/returns", token: await bearer(outsider) },
      );
      expect(theirs.body.returns.some((r) => r.id === opened.body.return.id)).toBe(
        false,
      );
    });

    it("kapsam dışındaki talep tek tek de okunamıyor", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId);

      const res = await callRoute(getReturn, {
        url: `/api/returns/${opened.body.return.id}`,
        params: { id: opened.body.return.id },
        token: await bearer(outsider),
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("RETURN_NOT_FOUND");
    });

    it("temsilci portföyündeki firmanın talebini görüyor", async () => {
      const { orderId, orderItemId } = await shippedOrder();
      const opened = await requestReturn(orderItemId, orderId);

      const res = await callRoute<{ returns: Array<{ id: string }> }>(
        listReturns,
        { url: "/api/returns?open=1", token: await bearer(rep) },
      );
      expect(res.status).toBe(200);
      expect(res.body.returns.some((r) => r.id === opened.body.return.id)).toBe(
        true,
      );
    });
  });
});
