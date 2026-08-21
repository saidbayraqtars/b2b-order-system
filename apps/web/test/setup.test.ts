import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { GET as getSetup, POST as applyPack } from "@/app/api/admin/setup/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Kurulum sihirbazı ve sektör paketi.
//
// Paketin tek zor iddiası **tekrar çalıştırılabilirlik**: kurulumu yapan kişi
// düğmeye ikinci kez bastığında, ilk seferden sonra elle değiştirdiği satırlar
// yerinde kalmalı. Bu yüzden testlerin çoğu "ikinci çağrı ne yaptı" sorusunu
// soruyor — ilk çağrının çalıştığını görmek kolay, ikincisinin *çalışmadığını*
// görmek zor.

const fx = new Fixtures("setup");
const suite = hasDb ? describe : describe.skip;

const PACK = "genel-toptan";

let admin: TestUser;
let outsider: TestUser;

/** Paket öncesi tablo fotoğrafı — temizlik yalnızca yeni satırları siler. */
interface Snapshot {
  groups: string[];
  categories: string[];
  terms: string[];
  warehouses: string[];
  accounts: string[];
}

let before: Snapshot;

async function snapshot(): Promise<Snapshot> {
  const [groups, categories, terms, warehouses, accounts] = await Promise.all([
    prisma.customerGroup.findMany({ select: { id: true } }),
    prisma.category.findMany({ select: { id: true } }),
    prisma.paymentTerm.findMany({ select: { id: true } }),
    prisma.warehouse.findMany({ select: { id: true } }),
    prisma.cashAccount.findMany({ select: { id: true } }),
  ]);
  return {
    groups: groups.map((r) => r.id),
    categories: categories.map((r) => r.id),
    terms: terms.map((r) => r.id),
    warehouses: warehouses.map((r) => r.id),
    accounts: accounts.map((r) => r.id),
  };
}

suite("kurulum sihirbazı ve sektör paketi (HTTP)", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    // Süper admin ama kuruluş yetkisi yok: paket uygulayamamalı.
    outsider = await fx.user("SUPER_ADMIN", {
      permissions: ["companies.view"],
      label: "kurulumsuz",
    });
    before = await snapshot();
  });

  afterAll(async () => {
    // Paketin yazdığı satırlar başka takımların verisi değil; yalnızca bu
    // testte doğanlar siliniyor, önceden var olanlara dokunulmuyor.
    const after = await snapshot();
    const fresh = (a: string[], b: string[]) => b.filter((id) => !a.includes(id));

    await prisma.cashAccount.deleteMany({
      where: { id: { in: fresh(before.accounts, after.accounts) } },
    });
    await prisma.warehouse.deleteMany({
      where: { id: { in: fresh(before.warehouses, after.warehouses) } },
    });
    await prisma.paymentTerm.deleteMany({
      where: { id: { in: fresh(before.terms, after.terms) } },
    });
    // Çocuk kategoriler önce: ağaç kendine bakıyor.
    const newCategories = fresh(before.categories, after.categories);
    await prisma.category.deleteMany({
      where: { id: { in: newCategories }, parentId: { not: null } },
    });
    await prisma.category.deleteMany({ where: { id: { in: newCategories } } });
    await prisma.customerGroup.deleteMany({
      where: { id: { in: fresh(before.groups, after.groups) } },
    });

    await fx.teardown();
  });

  it("durum ucu her adımı ve ilerlemeyi döner", async () => {
    const res = await callRoute(getSetup, { token: await bearer(admin) });

    expect(res.status).toBe(200);
    const keys = res.body.status.steps.map((s: { key: string }) => s.key);
    expect(keys).toContain("tenant");
    expect(keys).toContain("prices");
    expect(keys).toContain("erp");
    // İlerleme yalnızca zorunlu adımları sayar; isteğe bağlılar paydaya girmez.
    const required = res.body.status.steps.filter(
      (s: { optional: boolean }) => !s.optional,
    );
    expect(res.body.status.progress.total).toBe(required.length);
    expect(res.body.packs.length).toBeGreaterThan(0);
  });

  it("kuruluş yetkisi olmayan yönetici ne durumu görür ne paket uygular", async () => {
    const read = await callRoute(getSetup, { token: await bearer(outsider) });
    expect(read.status).toBe(403);

    const write = await callRoute(applyPack, {
      method: "POST",
      token: await bearer(outsider),
      body: { pack: PACK },
    });
    expect(write.status).toBe(403);
  });

  it("oturumsuz istek reddedilir", async () => {
    const res = await callRoute(getSetup, { token: null });
    expect(res.status).toBe(401);
  });

  it("bilinmeyen paket adı yazılmadan reddedilir", async () => {
    const groupsBefore = await prisma.customerGroup.count();

    const res = await callRoute(applyPack, {
      method: "POST",
      token: await bearer(admin),
      body: { pack: "bakkal-defteri" },
    });

    expect(res.status).toBe(409);
    expect(await prisma.customerGroup.count()).toBe(groupsBefore);
  });

  it("paket iskeleti kurar ve durumu ilerletir", async () => {
    const res = await callRoute(applyPack, {
      method: "POST",
      token: await bearer(admin),
      body: { pack: PACK },
    });

    expect(res.status).toBe(200);
    expect(res.body.report.pack).toBe(PACK);

    const step = (key: string) =>
      res.body.status.steps.find((s: { key: string }) => s.key === key);
    expect(step("customerGroups").done).toBe(true);
    expect(step("categories").done).toBe(true);
    expect(step("paymentTerms").done).toBe(true);
    expect(step("warehouses").done).toBe(true);
    expect(step("cashAccounts").done).toBe(true);

    // Ürün ve müşteri paketten gelmez: onlar her firmada başka.
    expect(await prisma.product.count({ where: { name: "Genel" } })).toBe(0);
  });

  it("ikinci uygulama hiçbir satırı yeniden yazmaz", async () => {
    const term = await prisma.paymentTerm.findUnique({ where: { name: "30 gün" } });
    expect(term).not.toBeNull();
    // Kurulumu yapan kişinin elle yaptığı düzenleme: paket bunu ezmemeli.
    await prisma.paymentTerm.update({
      where: { id: term!.id },
      data: { days: 35 },
    });

    const res = await callRoute(applyPack, {
      method: "POST",
      token: await bearer(admin),
      body: { pack: PACK },
    });

    expect(res.status).toBe(200);
    expect(res.body.report.created).toEqual({});
    expect(res.body.report.skipped["Vade"]).toBeGreaterThan(0);

    const after = await prisma.paymentTerm.findUnique({ where: { id: term!.id } });
    expect(after!.days).toBe(35);
  });

  it("ikinci varsayılan depo açılmaz", async () => {
    const defaults = await prisma.warehouse.count({ where: { isDefault: true } });
    expect(defaults).toBeLessThanOrEqual(1);
  });
});
