import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@repo/database";
import { GET as getErp, POST as pushErp } from "@/app/api/orders/[id]/erp/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Siparişin ERP'ye aktarılması — düğmeden ajana kadar.
//
// Ajanın kendi tarafı `apps/erp-agent` içinde ayrıca test ediliyor (hangi
// sütuna ne yazıldığı, mükerrer kontrolü, numaralandırma). Burada test edilen
// şey **bu tarafın kapısı**: kimin basabildiği, hangi siparişin gidebildiği,
// eşleşmeyen kodun ajana hiç ulaşmadığı ve bir siparişin iki kez yazılamadığı.
//
// Ajan sahte: `fetch` yerine geçen bir işlev. Gerçek bir VegaDB'ye karşı
// koşmak bu testin işi değil ve olmamalı — o iş kılavuzun §43.2 kontrol
// listesine ait, tek bir sembolik belgeyle ve gözle.

const fx = new Fixtures("erppush");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let manager: TestUser;
let companyId: string;
let variantId: string;
let suiteStart: Date;

const ENV = {
  url: process.env.ERP_AGENT_URL,
  token: process.env.ERP_AGENT_TOKEN,
};

interface AgentCall {
  url: string;
  headers: Record<string, string>;
  body: { command: string; requestId: string; payload: Record<string, any> };
}

const calls: AgentCall[] = [];

/** Ajanın yerine geçen sahte uç. */
function fakeAgent(response: unknown, status = 200): void {
  vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return new Response(JSON.stringify(response), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

async function makeOrder(options: {
  status?: "DRAFT" | "PENDING_APPROVAL" | "CONFIRMED";
  externalCode?: string | null;
  variantExternalCode?: string | null;
} = {}): Promise<{ id: string; orderNumber: string }> {
  await prisma.company.update({
    where: { id: companyId },
    data: { externalCode: options.externalCode === undefined ? "CARI-1" : options.externalCode },
  });
  await prisma.productVariant.update({
    where: { id: variantId },
    data: {
      externalCode:
        options.variantExternalCode === undefined ? "STK-1" : options.variantExternalCode,
    },
  });

  const orderNumber = `ERPT-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
  const order = await prisma.order.create({
    data: {
      orderNumber,
      status: options.status ?? "CONFIRMED",
      companyId,
      createdById: admin.id,
      subtotal: 1000,
      discountTotal: 0,
      promotionTotal: 100,
      taxTotal: 180,
      grandTotal: 1080,
      items: {
        create: {
          variantId,
          productName: "Ürün bir",
          sku: "SKU-1",
          quantity: 10,
          unitPrice: 100,
          lineTotal: 1000,
          promotionDiscount: 100,
          vatRate: 20,
        },
      },
    },
    select: { id: true, orderNumber: true },
  });
  return order;
}

suite("ERP'ye sipariş aktarımı (HTTP)", () => {
  beforeAll(async () => {
    suiteStart = new Date();
    process.env.ERP_AGENT_URL = "https://erp-ajan.test";
    process.env.ERP_AGENT_TOKEN = "t".repeat(40);

    admin = await fx.user("SUPER_ADMIN");
    const groupId = await fx.group();
    companyId = await fx.company({ customerGroupId: groupId, creditLimit: 1_000_000 });
    manager = await fx.user("COMPANY_ADMIN", { companyId });
    ({ variantId } = await fx.variant({ price: 100, stock: 500 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    calls.length = 0;
  });

  afterAll(async () => {
    process.env.ERP_AGENT_URL = ENV.url;
    process.env.ERP_AGENT_TOKEN = ENV.token;
    if (hasDb) {
      await prisma.erpSyncIssue.deleteMany({
        where: { run: { kind: "ORDER_WRITE", startedAt: { gte: suiteStart } } },
      });
      await prisma.erpSyncRun.deleteMany({
        where: { kind: "ORDER_WRITE", startedAt: { gte: suiteStart } },
      });
    }
    await fx.teardown();
  });

  it("alıcı firmanın yöneticisi aktaramaz", async () => {
    const order = await makeOrder();
    const res = await callRoute(pushErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "POST",
      params: { id: order.id },
      token: await bearer(manager),
    });
    // Aktarım satıcının/muhasebenin işi. Alıcı, kendi siparişini müşterisinin
    // muhasebe defterine yazamaz.
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("onaylanmamış sipariş gitmez", async () => {
    const order = await makeOrder({ status: "PENDING_APPROVAL" });
    const res = await callRoute(pushErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "POST",
      params: { id: order.id },
      token: await bearer(admin),
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERP_WRITE_NOT_ALLOWED");
    expect(calls).toHaveLength(0);
  });

  it("firmanın ERP kodu yoksa ajana hiç sorulmaz", async () => {
    const order = await makeOrder({ externalCode: null });
    const res = await callRoute(pushErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "POST",
      params: { id: order.id },
      token: await bearer(admin),
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERP_MAPPING_MISSING");
    expect(calls).toHaveLength(0);
  });

  it("bir satırın stok kodu eksikse belge hiç gönderilmez", async () => {
    const order = await makeOrder({ variantExternalCode: null });
    const res = await callRoute(pushErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "POST",
      params: { id: order.id },
      token: await bearer(admin),
    });
    // Kısmi aktarım yok: eksik satırla yazılmış bir sipariş, ERP'de doğru
    // görünüp yanlış olan bir belge demek.
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("SKU-1");
    expect(calls).toHaveLength(0);
  });

  it("aktarır: komut adı ve normalize satırlar gider, SQL gitmez", async () => {
    fakeAgent({
      ok: true,
      command: "writeOrder",
      result: {
        documentNumber: "B0000042",
        documentInd: 5150,
        lineCount: 1,
        duplicate: false,
        omittedColumns: [],
      },
    });

    const order = await makeOrder();
    const res = await callRoute(pushErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "POST",
      params: { id: order.id },
      token: await bearer(admin),
    });

    expect(res.status).toBe(200);
    expect(res.body.documentNumber).toBe("B0000042");

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://erp-ajan.test/command");
    expect(call.headers.Authorization).toBe(`Bearer ${"t".repeat(40)}`);
    expect(call.body.command).toBe("writeOrder");

    // Giden gövdede hiçbir SQL yok — komutun adı ve siparişin kendisi var.
    expect(JSON.stringify(call.body)).not.toMatch(/INSERT|SELECT|UPDATE|DELETE/i);

    const payload = call.body.payload;
    expect(payload.reference).toBe(order.orderNumber);
    expect(payload.customerCode).toBe("CARI-1");
    // Kampanya indirimi satırdan düşülmüş gidiyor: 1000 − 100.
    expect(payload.netTotal).toBe(900);
    expect(payload.grandTotal).toBe(1080);
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]).toMatchObject({
      productCode: "STK-1",
      quantity: 10,
      unitPrice: 90,
      lineTotal: 900,
      vatRate: 20,
    });

    const saved = await prisma.order.findUnique({
      where: { id: order.id },
      select: { erpDocumentNo: true, erpDocumentInd: true, erpPushedById: true },
    });
    expect(saved).toMatchObject({
      erpDocumentNo: "B0000042",
      erpDocumentInd: 5150,
      erpPushedById: admin.id,
    });
  });

  it("aktarılmış sipariş ikinci kez gönderilmez", async () => {
    fakeAgent({
      ok: true,
      result: { documentNumber: "B0000043", documentInd: 5151, lineCount: 1, duplicate: false },
    });
    const order = await makeOrder();
    await callRoute(pushErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "POST",
      params: { id: order.id },
      token: await bearer(admin),
    });

    const again = await callRoute(pushErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "POST",
      params: { id: order.id },
      token: await bearer(admin),
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ERP_ALREADY_PUSHED");
    // Ajana bir kez gidildi, ikinci basışta hiç gidilmedi.
    expect(calls).toHaveLength(1);
  });

  it("ajan reddederse sebep kaydedilir ve sipariş aktarılmamış kalır", async () => {
    fakeAgent({
      ok: false,
      code: "YAZMA_KAPALI",
      message: "ERP'ye yazma bu ajanda kapalı.",
    });

    const order = await makeOrder();
    const res = await callRoute(pushErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "POST",
      params: { id: order.id },
      token: await bearer(admin),
    });

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("yazma bu ajanda kapalı");

    const saved = await prisma.order.findUnique({
      where: { id: order.id },
      select: { erpDocumentNo: true, erpPushError: true },
    });
    expect(saved?.erpDocumentNo).toBeNull();
    expect(saved?.erpPushError).toContain("yazma bu ajanda kapalı");

    // Başarısız deneme, eşleşmeyen cari kodu gibi listelenebilsin diye
    // ERP ekranındaki kayıtlara da düşüyor.
    const issue = await prisma.erpSyncIssue.findFirst({
      where: { externalCode: order.orderNumber },
      select: { reason: true, run: { select: { kind: true, status: true } } },
    });
    expect(issue?.run).toMatchObject({ kind: "ORDER_WRITE", status: "FAILED" });
  });

  it("ajana ulaşılamazsa hata sipariş üzerinde kalır", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("fetch failed");
    });

    const order = await makeOrder();
    const res = await callRoute(pushErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "POST",
      params: { id: order.id },
      token: await bearer(admin),
    });

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("ulaşılamadı");
  });

  it("durum ucu aktarılabilirliği söyler", async () => {
    const order = await makeOrder({ status: "DRAFT" });
    const res = await callRoute(getErp, {
      url: `/api/orders/${order.id}/erp`,
      method: "GET",
      params: { id: order.id },
      token: await bearer(admin),
    });

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.canPush).toBe(false);
    expect(res.body.reason).toContain("onaylanmalı");
  });

  it("ortam tanımlı değilse özellik kapalı görünür", async () => {
    delete process.env.ERP_AGENT_URL;
    try {
      const order = await makeOrder();
      const res = await callRoute(getErp, {
        url: `/api/orders/${order.id}/erp`,
        method: "GET",
        params: { id: order.id },
        token: await bearer(admin),
      });
      expect(res.body.configured).toBe(false);
      expect(res.body.canPush).toBe(false);

      const push = await callRoute(pushErp, {
        url: `/api/orders/${order.id}/erp`,
        method: "POST",
        params: { id: order.id },
        token: await bearer(admin),
      });
      expect(push.status).toBe(501);
      expect(push.body.code).toBe("ERP_WRITE_DISABLED");
    } finally {
      process.env.ERP_AGENT_URL = "https://erp-ajan.test";
    }
  });
});
