import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import type { OrderStatus } from "@repo/types";
import { GET as getOrders } from "@/app/api/orders/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// D5 — sipariş listesinin sekmeleri ve araması, HTTP sınırından.
//
// Sekme bir durum grubu (`?durum=bekleyen`), sayılar grup süzgecinden önceki
// kapsamdan geliyor. İki tuzak sınanıyor: arama plasiyerin portföy kapsamını
// silmemeli (ikisi de `company` anahtarında) ve sekme sayısı başka sekmedeyken
// de aynı kalmalı.

const fx = new Fixtures("siplist");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let rep: TestUser;
let mine: string;
let theirs: string;

function orderRow(companyId: string, status: OrderStatus, prefix: string) {
  return {
    orderNumber: `${prefix}-${fx.tag}-${Math.random().toString(36).slice(2, 8)}`,
    companyId,
    createdById: admin.id,
    status,
    subtotal: 100,
    discountTotal: 0,
    taxTotal: 20,
    grandTotal: 120,
  };
}

suite("sipariş listesi: sekme ve arama (HTTP)", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    rep = await fx.user("SALES_REP");
    const groupId = await fx.group();
    mine = await fx.company({
      customerGroupId: groupId,
      salesRepId: rep.id,
      label: "Portfoy",
    });
    theirs = await fx.company({ customerGroupId: groupId, label: "Yabanci" });

    await prisma.order.createMany({
      data: [
        orderRow(mine, "PENDING_APPROVAL", "SL"),
        orderRow(mine, "PENDING_CREDIT", "SL"),
        orderRow(mine, "SHIPPED", "SL"),
        orderRow(mine, "DELIVERED", "SL"),
        orderRow(mine, "REJECTED", "SL"),
        orderRow(theirs, "PENDING_APPROVAL", "SL"),
      ],
    });
  });

  afterAll(() => fx.teardown());

  it("sekme yalnız o gruptaki durumları döker, sayılar bütün kapsamın", async () => {
    const res = await callRoute(getOrders, {
      url: `/api/orders?companyId=${mine}&durum=bekleyen`,
      token: await bearer(admin),
    });
    expect(res.status).toBe(200);
    const statuses = res.body.orders.map((o: { status: string }) => o.status);
    expect(statuses.sort()).toEqual(["PENDING_APPROVAL", "PENDING_CREDIT"]);
    expect(res.body.counts).toEqual({
      tumu: 5,
      bekleyen: 2,
      acik: 1,
      teslim: 1,
      iptal: 1,
    });
  });

  it("bilinmeyen sekme süzgeç sayılmaz, liste tümüdür", async () => {
    const res = await callRoute(getOrders, {
      url: `/api/orders?companyId=${mine}&durum=toString`,
      token: await bearer(admin),
    });
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(5);
  });

  it("firma adıyla arama", async () => {
    const res = await callRoute(getOrders, {
      url: `/api/orders?q=${encodeURIComponent(`Yabanci ${fx.tag}`)}`,
      token: await bearer(admin),
    });
    expect(res.status).toBe(200);
    const ids = res.body.orders.map(
      (o: { company: { id: string } }) => o.company.id,
    );
    expect(ids).toEqual([theirs]);
    expect(res.body.counts.tumu).toBe(1);
  });

  it("plasiyerin araması portföyün dışına taşmaz", async () => {
    // Arama iki firmanın da siparişine uyuyor (ortak önek); plasiyer yalnız
    // kendi portföyündekini görmeli.
    const res = await callRoute(getOrders, {
      url: `/api/orders?q=${encodeURIComponent(`SL-${fx.tag}`)}`,
      token: await bearer(rep),
    });
    expect(res.status).toBe(200);
    const companies = new Set(
      res.body.orders.map((o: { company: { id: string } }) => o.company.id),
    );
    expect([...companies]).toEqual([mine]);
    expect(res.body.counts.tumu).toBe(5);
  });
});
