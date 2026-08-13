import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { GET as getDatasets } from "@/app/api/reports/datasets/route";
import { POST as runReport } from "@/app/api/reports/run/route";
import {
  GET as listDefinitions,
  POST as createDefinition,
} from "@/app/api/reports/definitions/route";
import { GET as runDefinition } from "@/app/api/reports/definitions/[id]/run/route";
import { POST as createDashboard } from "@/app/api/reports/dashboards/route";
import { GET as runDashboardRoute } from "@/app/api/reports/dashboards/[id]/run/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// The report builder is the one place where a user composes a query and the
// server executes it. Two properties keep that safe, and both are worth
// checking from outside: only registry-declared fields survive, and the row
// scope is ANDed on afterwards — so a saved report cannot show its runner
// anything they could not already see.

const fx = new Fixtures("report");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let rep: TestUser;
let manager: TestUser;
let mine: string;
let theirs: string;

const ORDER_COLUMNS = {
  columns: [{ field: "orderNumber" }, { field: "grandTotal" }],
  filters: [],
  groupBy: [],
  sort: [],
};

suite("rapor tasarımcısı (HTTP)", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    rep = await fx.user("SALES_REP");

    const groupId = await fx.group();
    mine = await fx.company({ customerGroupId: groupId, salesRepId: rep.id });
    theirs = await fx.company({ customerGroupId: groupId, label: "Yabanci" });
    manager = await fx.user("COMPANY_ADMIN", { companyId: mine });

    await prisma.order.createMany({
      data: [
        orderRow(mine, admin.id, "RP-MINE"),
        orderRow(theirs, admin.id, "RP-THEIRS"),
      ],
    });
  });

  afterAll(() => fx.teardown());

  describe("alan kayıt defteri sınırdır", () => {
    it("alan listesi izinli role açılır", async () => {
      const res = await callRoute(getDatasets, {
        url: "/api/reports/datasets",
        token: await bearer(admin),
      });
      expect(res.status).toBe(200);
      expect(res.body.datasets.length).toBeGreaterThan(0);
    });

    it("kayıt defterinde olmayan alan reddedilir", async () => {
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: {
          dataset: "ORDERS",
          config: { ...ORDER_COLUMNS, columns: [{ field: "passwordHash" }] },
        },
        token: await bearer(admin),
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("INVALID_REPORT");
    });

    it("süzgeçteki alan da denetlenir", async () => {
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: {
          dataset: "ORDERS",
          config: {
            ...ORDER_COLUMNS,
            filters: [{ field: "company.members.passwordHash", operator: "eq", value: "x" }],
          },
        },
        token: await bearer(admin),
      });
      expect(res.status).toBe(422);
    });

    it("gruplamadaki alan da denetlenir", async () => {
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: {
          dataset: "ORDERS",
          config: { ...ORDER_COLUMNS, groupBy: ["uydurma_alan"] },
        },
        token: await bearer(admin),
      });
      expect(res.status).toBe(422);
    });

    it("sütunsuz rapor olmaz", async () => {
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: { dataset: "ORDERS", config: { ...ORDER_COLUMNS, columns: [] } },
        token: await bearer(admin),
      });
      expect(res.status).toBe(400);
    });

    it("bilinmeyen veri kümesi reddedilir", async () => {
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: { dataset: "PASSWORDS", config: ORDER_COLUMNS },
        token: await bearer(admin),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("satır kapsamı raporun üstüne eklenir", () => {
    it("plasiyer yalnız portföyünün siparişlerini raporlar", async () => {
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: {
          dataset: "ORDERS",
          config: {
            ...ORDER_COLUMNS,
            columns: [{ field: "orderNumber" }, { field: "companyName" }],
          },
        },
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
      const numbers = res.body.rows.map((r: Record<string, unknown>) => r.orderNumber);
      expect(numbers.some((n: string) => n?.startsWith("RP-MINE"))).toBe(true);
      expect(numbers.some((n: string) => n?.startsWith("RP-THEIRS"))).toBe(false);
    });

    it("bayi yöneticisi yalnız kendi firmasını raporlar", async () => {
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: {
          dataset: "ORDERS",
          config: {
            ...ORDER_COLUMNS,
            columns: [{ field: "orderNumber" }, { field: "companyName" }],
          },
        },
        token: await bearer(manager),
      });
      expect(res.status).toBe(200);
      const numbers = res.body.rows.map((r: Record<string, unknown>) => r.orderNumber);
      expect(numbers.some((n: string) => n?.startsWith("RP-THEIRS"))).toBe(false);
    });

    it("elle yazılan süzgeç kapsamı genişletemez", async () => {
      // Kapsam kullanıcının süzgecinden *sonra* ekleniyor: başka firmayı adıyla
      // istemek bile onu getirmez.
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: {
          dataset: "ORDERS",
          config: {
            ...ORDER_COLUMNS,
            columns: [{ field: "orderNumber" }, { field: "companyName" }],
            filters: [{ field: "orderNumber", operator: "contains", value: "RP-" }],
          },
        },
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
      const numbers = res.body.rows.map((r: Record<string, unknown>) => r.orderNumber);
      expect(numbers.some((n: string) => n?.startsWith("RP-THEIRS"))).toBe(false);
    });

    it("süper admin ikisini de görür", async () => {
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: {
          dataset: "ORDERS",
          config: {
            ...ORDER_COLUMNS,
            filters: [{ field: "orderNumber", operator: "contains", value: "RP-" }],
          },
        },
        token: await bearer(admin),
      });
      expect(res.status).toBe(200);
      const numbers = res.body.rows.map((r: Record<string, unknown>) => r.orderNumber);
      expect(numbers.some((n: string) => n?.startsWith("RP-MINE"))).toBe(true);
      expect(numbers.some((n: string) => n?.startsWith("RP-THEIRS"))).toBe(true);
    });
  });

  describe("kaydedilen rapor kimin adına koşar", () => {
    let sharedId: string;

    it("paylaşılan rapor kaydedilir", async () => {
      const res = await callRoute(createDefinition, {
        url: "/api/reports/definitions",
        method: "POST",
        body: {
          name: `Paylaşılan ${fx.tag}`,
          dataset: "ORDERS",
          isShared: true,
          config: {
            ...ORDER_COLUMNS,
            filters: [{ field: "orderNumber", operator: "contains", value: "RP-" }],
          },
        },
        token: await bearer(admin),
      });
      expect(res.status).toBe(201);
      sharedId = res.body.id ?? res.body.definition?.id;
      expect(sharedId).toBeTruthy();
    });

    it("başkasının paylaştığı rapor koşanın kapsamıyla çalışır", async () => {
      // Süper adminin kaydettiği rapor plasiyerin elinde plasiyerin verisini
      // döndürür — tanım paylaşılır, görüş alanı paylaşılmaz.
      const res = await callRoute(runDefinition, {
        url: `/api/reports/definitions/${sharedId}/run`,
        params: { id: sharedId },
        token: await bearer(rep),
      });
      expect(res.status).toBe(200);
      const numbers = res.body.rows.map((r: Record<string, unknown>) => r.orderNumber);
      expect(numbers.some((n: string) => n?.startsWith("RP-THEIRS"))).toBe(false);
    });

    it("paylaşılmayan rapor sahibinden başkasına görünmez", async () => {
      const created = await callRoute(createDefinition, {
        url: "/api/reports/definitions",
        method: "POST",
        body: {
          name: `Özel ${fx.tag}`,
          dataset: "ORDERS",
          isShared: false,
          config: ORDER_COLUMNS,
        },
        token: await bearer(admin),
      });
      const privateId = created.body.id ?? created.body.definition?.id;

      const list = await callRoute(listDefinitions, {
        url: "/api/reports/definitions",
        token: await bearer(rep),
      });
      const ids = list.body.definitions.map((d: { id: string }) => d.id);
      expect(ids).not.toContain(privateId);

      const run = await callRoute(runDefinition, {
        url: `/api/reports/definitions/${privateId}/run`,
        params: { id: privateId },
        token: await bearer(rep),
      });
      // Listede yok, kimliği tahmin edilse bile koşmuyor.
      expect(run.status).toBe(403);
    });
  });

  describe("pano", () => {
    let boardId: string;
    let tileReport: string;

    it("pano kaydedilir ve kartları koşar", async () => {
      const report = await callRoute(createDefinition, {
        url: "/api/reports/definitions",
        method: "POST",
        body: {
          name: `Pano raporu ${fx.tag}`,
          dataset: "ORDERS",
          isShared: true,
          config: {
            ...ORDER_COLUMNS,
            filters: [{ field: "orderNumber", operator: "contains", value: "RP-" }],
          },
        },
        token: await bearer(admin),
      });
      tileReport = report.body.id;

      const created = await callRoute(createDashboard, {
        url: "/api/reports/dashboards",
        method: "POST",
        body: {
          name: `Pano ${fx.tag}`,
          isShared: true,
          tiles: [{ definitionId: tileReport, width: "full" }],
        },
        token: await bearer(admin),
      });
      expect(created.status).toBe(201);
      boardId = created.body.id;

      const run = await callRoute(runDashboardRoute, {
        url: `/api/reports/dashboards/${boardId}/run`,
        params: { id: boardId },
        token: await bearer(admin),
      });
      expect(run.status).toBe(200);
      expect(run.body.tiles).toHaveLength(1);
      expect(run.body.tiles[0].error).toBeNull();
    });

    it("paylaşılan pano da koşanın kapsamıyla çalışır", async () => {
      const run = await callRoute(runDashboardRoute, {
        url: `/api/reports/dashboards/${boardId}/run`,
        params: { id: boardId },
        token: await bearer(rep),
      });
      expect(run.status).toBe(200);
      const numbers = run.body.tiles[0].result.rows.map(
        (r: Record<string, unknown>) => r.orderNumber,
      );
      expect(numbers.some((n: string) => n?.startsWith("RP-THEIRS"))).toBe(false);
      // Başkasının panosunda düzenleme düğmesi çıkmasın diye.
      expect(run.body.canEdit).toBe(false);
    });

    it("kurye panoyu açamaz", async () => {
      // Ayrı etiket: harness e-postayı etiketten üretiyor, "COURIER" adı
      // aşağıdaki testte de kullanılıyor.
      const courier = await fx.user("COURIER", { label: "kurye-pano" });
      const res = await callRoute(runDashboardRoute, {
        url: `/api/reports/dashboards/${boardId}/run`,
        params: { id: boardId },
        token: await bearer(courier),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("kapı", () => {
    it("bayi personeli rapor tasarımcısını açamaz", async () => {
      const staff = await fx.user("COMPANY_STAFF", { companyId: mine });
      const res = await callRoute(getDatasets, {
        url: "/api/reports/datasets",
        token: await bearer(staff),
      });
      expect(res.status).toBe(403);
    });

    it("kurye rapor koşturamaz", async () => {
      const courier = await fx.user("COURIER");
      const res = await callRoute(runReport, {
        url: "/api/reports/run",
        method: "POST",
        body: { dataset: "ORDERS", config: ORDER_COLUMNS },
        token: await bearer(courier),
      });
      expect(res.status).toBe(403);
    });
  });
});

function orderRow(companyId: string, createdById: string, prefix: string) {
  return {
    orderNumber: `${prefix}-${Math.random().toString(36).slice(2, 10)}`,
    companyId,
    createdById,
    status: "CONFIRMED" as const,
    subtotal: 100,
    discountTotal: 0,
    taxTotal: 20,
    grandTotal: 120,
  };
}
