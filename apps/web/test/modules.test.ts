import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { invalidateModuleCache } from "@repo/services";
import { GET as listModules } from "@/app/api/admin/modules/route";
import { PUT as putModule } from "@/app/api/admin/modules/[key]/route";
import { GET as disabledModules } from "@/app/api/modules/route";
import { GET as listCommission } from "@/app/api/admin/commission/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Modül uçları ve kapının kendisi.
//
// "prim" modülü kullanılıyor: hiçbir başka test dosyası ona bakmıyor, kapatmak
// paralel koşan paketleri etkilemiyor. Önceki hâli saklanıp geri konuyor.
//
// İddia: kapalı modülün ucu, izni olan kullanıcıya bile 403 döner ve mesaj
// "yetkiniz yok" değil "bu özellik kapalı" der — kullanıcıya kimsenin
// veremeyeceği bir yetkiyi aratmamak için.

const fx = new Fixtures("modul");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let plain: TestUser;
let before: { enabled: boolean } | null = null;

beforeAll(async () => {
  if (!hasDb) return;
  before = await prisma.installationModule.findUnique({
    where: { key: "prim" },
    select: { enabled: true },
  });
  admin = await fx.user("SUPER_ADMIN");
  plain = await fx.user("SUPER_ADMIN", {
    permissions: ["commission.manage"],
    label: "primci",
  });
});

afterAll(async () => {
  if (!hasDb) return;
  await prisma.installationModule.deleteMany({ where: { key: "prim" } });
  if (before) await prisma.installationModule.create({ data: { key: "prim", ...before } });
  invalidateModuleCache();
  await fx.teardown();
});

suite("modül uçları", () => {
  it("modül listesi yalnızca kuruluş ayarı izniyle", async () => {
    const denied = await callRoute(listModules, {
      url: "/api/admin/modules",
      token: await bearer(plain),
    });
    expect(denied.status).toBe(403);

    const ok = await callRoute(listModules, {
      url: "/api/admin/modules",
      token: await bearer(admin),
    });
    expect(ok.status).toBe(200);
    expect(ok.body.modules.map((m: { key: string }) => m.key)).toContain("prim");
  });

  it("bilinmeyen modül 400, gövdesiz istek 400", async () => {
    const unknown = await callRoute(putModule, {
      url: "/api/admin/modules/yok",
      method: "PUT",
      token: await bearer(admin),
      params: { key: "yok" },
      body: { enabled: false },
    });
    expect(unknown.status).toBe(400);

    const noBody = await callRoute(putModule, {
      url: "/api/admin/modules/prim",
      method: "PUT",
      token: await bearer(admin),
      params: { key: "prim" },
      body: {},
    });
    expect(noBody.status).toBe(400);
  });

  it("kapalı modülün ucu izni olana da kapanır ve nedenini söyler", async () => {
    const open = await callRoute(listCommission, {
      url: "/api/admin/commission",
      token: await bearer(plain),
    });
    expect(open.status).toBe(200);

    const off = await callRoute(putModule, {
      url: "/api/admin/modules/prim",
      method: "PUT",
      token: await bearer(admin),
      params: { key: "prim" },
      body: { enabled: false },
    });
    expect(off.status).toBe(200);
    expect(off.body.module).toMatchObject({ key: "prim", enabled: false });

    const denialsBefore = await prisma.auditLog.count({
      where: { actorId: plain.id, action: "ACCESS_DENIED" },
    });
    const closed = await callRoute(listCommission, {
      url: "/api/admin/commission",
      token: await bearer(plain),
    });
    expect(closed.status).toBe(403);
    expect(JSON.stringify(closed.body)).toContain("kapalı");

    const state = await callRoute(disabledModules, {
      url: "/api/modules",
      token: await bearer(plain),
    });
    expect(state.body.disabled).toContain("prim");

    // Kapalı modül bir yetki ihlali değil: denetim kaydına ret yazılmıyor.
    const denialsAfter = await prisma.auditLog.count({
      where: { actorId: plain.id, action: "ACCESS_DENIED" },
    });
    expect(denialsAfter).toBe(denialsBefore);

    await callRoute(putModule, {
      url: "/api/admin/modules/prim",
      method: "PUT",
      token: await bearer(admin),
      params: { key: "prim" },
      body: { enabled: true },
    });
    const reopened = await callRoute(listCommission, {
      url: "/api/admin/commission",
      token: await bearer(plain),
    });
    expect(reopened.status).toBe(200);
  });

  it("aç/kapa denetim kaydına düşer", async () => {
    const rows = await prisma.auditLog.count({
      where: { actorId: admin.id, action: "MODULE_TOGGLED", entityId: "prim" },
    });
    expect(rows).toBeGreaterThanOrEqual(2);
  });
});
