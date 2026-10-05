import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  invalidateModuleCache,
  setModuleEnabled,
  upsertWarehouse,
} from "@repo/services";
import {
  GET as getStock,
  PATCH as patchStock,
} from "@/app/api/admin/stock/route";
import { PATCH as patchCompany } from "@/app/api/admin/companies/[id]/route";
import { POST as postOrder } from "@/app/api/orders/route";
import { POST as postQuote } from "@/app/api/orders/quote/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// F3 — depo bazlı stok, HTTP sınırından.
//
// Servis testi (packages/services warehouse-orders) hesabı kanıtlıyor; burası
// kapıları: depo ayarını kim yazabilir, alıcı çıkış deposu seçebilir mi,
// "sipariş alınmasın" hangi durum koduyla döner, firma formu depoyu tutar mı.

const fx = new Fixtures("depo");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let viewer: TestUser;
let manager: TestUser;
let companyId: string;
let variantId: string;
let merkezId: string;
let subeId: string;
let depoBefore: { enabled: boolean } | null = null;

suite("depo bazlı stok (HTTP)", () => {
  beforeAll(async () => {
    depoBefore = await prisma.installationModule.findUnique({
      where: { key: "depo" },
      select: { enabled: true },
    });
    admin = await fx.user("SUPER_ADMIN");
    viewer = await fx.user("SUPER_ADMIN", {
      permissions: ["stock.view"],
      label: "stokokur",
    });

    const groupId = await fx.group();
    companyId = await fx.company({
      customerGroupId: groupId,
      creditLimit: 5_000_000,
    });
    manager = await fx.user("COMPANY_ADMIN", { companyId });
    ({ variantId } = await fx.variant({ customerGroupId: groupId, stock: 0 }));

    merkezId = (
      await upsertWarehouse({ code: `M-${fx.tag}`, name: `Merkez ${fx.tag}` })
    ).id;
    subeId = (
      await upsertWarehouse({ code: `S-${fx.tag}`, name: `Şube ${fx.tag}` })
    ).id;
    await prisma.variantStock.create({
      data: { variantId, warehouseId: subeId, onHand: 10 },
    });
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { stock: 10 },
    });

    await setModuleEnabled("depo", true);
    invalidateModuleCache();
  });

  afterAll(async () => {
    await prisma.installationModule.deleteMany({ where: { key: "depo" } });
    if (depoBefore)
      await prisma.installationModule.create({
        data: { key: "depo", ...depoBefore },
      });
    invalidateModuleCache();
    await fx.teardown();
    await prisma.warehouse.deleteMany({
      where: { id: { in: [merkezId, subeId] } },
    });
  });

  it("firma formu çıkış deposunu tutar", async () => {
    const res = await callRoute(patchCompany, {
      method: "PATCH",
      token: await bearer(admin),
      params: { id: companyId },
      body: { warehouseId: subeId },
    });
    expect(res.status).toBe(200);
    expect(res.body.company.warehouse).toMatchObject({ id: subeId });
  });

  it("depo ayarını yalnız stock.manage yazar; miktar değişmez", async () => {
    const denied = await callRoute(patchStock, {
      method: "PATCH",
      token: await bearer(viewer),
      body: { variantId, warehouseId: subeId, minStock: 4 },
    });
    expect(denied.status).toBe(403);

    const empty = await callRoute(patchStock, {
      method: "PATCH",
      token: await bearer(admin),
      body: { variantId, warehouseId: subeId },
    });
    expect(empty.status).toBe(400);

    const ok = await callRoute(patchStock, {
      method: "PATCH",
      token: await bearer(admin),
      body: {
        variantId,
        warehouseId: subeId,
        minStock: 12,
        blockOrders: false,
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      onHand: 10,
      minStock: 12,
      blockOrders: false,
    });

    const levels = await callRoute(getStock, {
      token: await bearer(viewer),
      url: `/api/admin/stock?warehouseId=${subeId}&lowOnly=1&q=${fx.tag}`,
    });
    expect(levels.status).toBe(200);
    // Şubede 10 var, eşik 12: kritik.
    expect(levels.body.levels).toEqual([
      expect.objectContaining({ variantId, warehouseOnHand: 10, warehouseMinStock: 12 }),
    ]);
  });

  it("alıcı çıkış deposu seçemez", async () => {
    const res = await callRoute(postQuote, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        warehouseId: merkezId,
        items: [{ variantId, quantity: 1 }],
      },
    });
    expect(res.status).toBe(403);
  });

  it("teklif deposu söyler; depoda olmayan mal 409", async () => {
    const quote = await callRoute(postQuote, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 2 }],
      },
    });
    expect(quote.status).toBe(200);
    expect(quote.body.warehouse).toMatchObject({ id: subeId });

    // Satıcı merkezden ister: merkezde satırı yok, yani mal yok.
    const fromMerkez = await callRoute(postOrder, {
      method: "POST",
      token: await bearer(admin),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        warehouseId: merkezId,
        items: [{ variantId, quantity: 2 }],
      },
    });
    expect(fromMerkez.status).toBe(409);
    expect(fromMerkez.body.code).toBe("INSUFFICIENT_STOCK");
  });

  it('"sipariş alınmasın" 409 ORDER_BLOCKED', async () => {
    await callRoute(patchStock, {
      method: "PATCH",
      token: await bearer(admin),
      body: { variantId, warehouseId: subeId, blockOrders: true },
    });

    const res = await callRoute(postOrder, {
      method: "POST",
      token: await bearer(manager),
      body: {
        companyId,
        paymentMethod: "OPEN_ACCOUNT",
        items: [{ variantId, quantity: 1 }],
      },
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ORDER_BLOCKED");
  });
});
