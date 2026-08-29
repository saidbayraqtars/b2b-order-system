import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { REPORT_TEMPLATES, runReportDefinition } from "@repo/services";
import {
  GET as listTemplates,
  POST as installTemplate,
} from "@/app/api/reports/templates/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Hazır rapor şablonları — uç tarafı.
//
// Şablonun kayıt defterinden geçtiği `report-templates.test.ts`te kanıtlanıyor.
// Buradaki iddialar kurulumun **kime** ait olduğuyla ilgili: rapor çağıranın
// adına açılıyor, ayrıcalık taşımıyor, ve aynı şablonu iki kez kurmak listeyi
// aynı adlı iki satırla doldurmuyor.

const fx = new Fixtures("rtpl");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
const createdIds: string[] = [];

beforeAll(async () => {
  if (!hasDb) return;
  admin = await fx.user("SUPER_ADMIN");
});

afterAll(async () => {
  if (!hasDb) return;
  await prisma.reportDefinition.deleteMany({ where: { id: { in: createdIds } } });
  await fx.teardown();
});

suite("hazır rapor şablonları", () => {
  it("katalog tanımın kendisini göndermiyor", async () => {
    const res = await callRoute<{
      templates: Array<Record<string, unknown>>;
    }>(listTemplates, { token: await bearer(admin) });

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(REPORT_TEMPLATES.length);
    // `config` listede yok: ekran onu göstermiyor ve bütün tanımları
    // taşımak cevabı gereksiz yere şişirirdi.
    expect(res.body.templates[0]).not.toHaveProperty("config");
    expect(res.body.templates[0]).toHaveProperty("question");
  });

  it("kurulan rapor çağıranın adına açılıyor ve çalışıyor", async () => {
    const res = await callRoute<{ id: string; name: string }>(installTemplate, {
      method: "POST",
      body: { key: "aylik-ciro" },
      token: await bearer(admin),
    });
    expect(res.status).toBe(201);
    createdIds.push(res.body.id);

    const row = await prisma.reportDefinition.findUnique({
      where: { id: res.body.id },
      select: { ownerId: true, isShared: true },
    });
    expect(row?.ownerId).toBe(admin.id);
    // Kurulan rapor paylaşık değil: şablonu kurmak, onu bütün ekibe açmak
    // demek olmamalı.
    expect(row?.isShared).toBe(false);

    // Kurulan tanım gerçekten koşuyor — kayıt defterinden geçmesi yetmiyor,
    // SQL'in de dönmesi gerekiyor.
    const run = await runReportDefinition(res.body.id, {
      userId: admin.id,
      role: admin.role,
      companyId: admin.companyId,
    });
    expect(run.grouped).toBe(true);
  });

  it("aynı şablon ikinci kez kurulunca ad çakışmıyor", async () => {
    const res = await callRoute<{ id: string; name: string }>(installTemplate, {
      method: "POST",
      body: { key: "aylik-ciro" },
      token: await bearer(admin),
    });
    expect(res.status).toBe(201);
    createdIds.push(res.body.id);
    expect(res.body.name).toBe("Aylık ciro (2)");
  });

  it("bilinmeyen anahtar 404", async () => {
    const res = await callRoute(installTemplate, {
      method: "POST",
      body: { key: "yok-boyle-bir-sey" },
      token: await bearer(admin),
    });
    expect(res.status).toBe(404);
  });

  it("rapor yetkisi olmayan katalogu göremiyor", async () => {
    const plain = await fx.user("SUPER_ADMIN", {
      permissions: [],
      label: "izinsiz",
    });
    const res = await callRoute(listTemplates, { token: await bearer(plain) });
    expect(res.status).toBe(403);
  });
});
