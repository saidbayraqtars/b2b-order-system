import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@repo/database";
import { defaultPermissionsFor, effectivePermissions, moduleOfPath } from "@repo/types";

// Modüller — kurulum başına açılıp kapanan özellik kümeleri.
//
// Kanıtlanacak iddialar:
//
//  1. Satırı olmayan modül açık; kapatmak satır yazar, açmak geri alır.
//  2. Kampanya / hacim / duyuru kapalıyken **hesap** da değişir: kampanya
//     uygulanmaz, basamak iskontosu düşer, portal duyuru göstermez.
//  3. Kapalı bir modülün izni etkin kümeden düşünce, o izni zaten taşıyan
//     personeli düzenlemek reddedilmez — kural yalnızca *yeni* verilene bakar.
//
// Fiyatı etkileyen modüller gerçekten kapatılmıyor: veritabanı paylaşılıyor ve
// paralel koşan kampanya testleri bozulurdu. Onlar için modül durumu
// taklit ediliyor; gerçek aç/kapa, başka hiçbir paketin kullanmadığı "prim"
// modülüyle sınanıyor.

const closed = new Set<string>();
vi.mock("../../src/modules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modules")>();
  return {
    ...actual,
    isModuleEnabled: vi.fn(async (key: string) =>
      closed.has(key) ? false : actual.isModuleEnabled(key as never),
    ),
  };
});

const {
  getDisabledModules,
  invalidateModuleCache,
  isModuleEnabled,
  listModules,
  setModuleEnabled,
} = await import("../../src/modules");
const { loadEligiblePromotions } = await import("../../src/promotion");
const { resolveVolumeDiscount } = await import("../../src/volume-discount");
const { listActiveAnnouncements } = await import("../../src/announcement");
const { updateUser } = await import("../../src/user-admin");

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;
const TAG = `mod${Date.now()}`;

let primBefore: { enabled: boolean } | null = null;
const userIds: string[] = [];
let promotionId: string;
let tierId: string;
let announcementId: string;

suite("modüller integration", () => {
  beforeAll(async () => {
    primBefore = await prisma.installationModule.findUnique({
      where: { key: "prim" },
      select: { enabled: true },
    });
    await prisma.installationModule.deleteMany({ where: { key: "prim" } });
    invalidateModuleCache();

    promotionId = (
      await prisma.promotion.create({
        data: {
          name: `Modül kampanyası ${TAG}`,
          conditions: [],
          actions: [{ type: "PERCENT_OFF", params: { percent: 5 } }],
        },
      })
    ).id;
    // Ulaşılamaz eşik: merdiven genel, öbür paketlerin firmalarına dokunmasın.
    tierId = (
      await prisma.volumeTier.create({
        data: { name: `Modül basamağı ${TAG}`, minRevenue: 999_999_999, discountPercent: 4 },
      })
    ).id;
    announcementId = (
      await prisma.announcement.create({
        data: { title: `Modül duyurusu ${TAG}`, body: "x" },
      })
    ).id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    await prisma.promotion.deleteMany({ where: { id: promotionId } });
    await prisma.volumeTier.deleteMany({ where: { id: tierId } });
    await prisma.announcement.deleteMany({ where: { id: announcementId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.installationModule.deleteMany({ where: { key: "prim" } });
    if (primBefore) {
      await prisma.installationModule.create({ data: { key: "prim", ...primBefore } });
    }
    invalidateModuleCache();
  });

  it("satırı olmayan modül açık; kapatmak ve açmak kalıcı", async () => {
    expect(await isModuleEnabled("prim")).toBe(true);

    const off = await setModuleEnabled("prim", false);
    expect(off.enabled).toBe(false);
    expect(await getDisabledModules()).toContain("prim");

    const on = await setModuleEnabled("prim", true);
    expect(on.enabled).toBe(true);
    expect(await getDisabledModules()).not.toContain("prim");
  });

  it("kapalı modülün izni etkin kümeden düşer, paylaşılan izin kalır", () => {
    const perms = defaultPermissionsFor("SUPER_ADMIN");
    const effective = effectivePermissions(perms, ["prim", "teslimat"]);
    expect(effective).not.toContain("commission.manage");
    expect(effective).not.toContain("delivery.confirm");
    // Dağıtım ekranını açan izin sevkiyatın da izni: modül kapanınca düşmemeli.
    expect(effective).toContain("orders.fulfil");
    expect(moduleOfPath("/admin/deliveries/abc")).toBe("teslimat");
    expect(moduleOfPath("/admin/deliveriesx")).toBeNull();
  });

  it("listede süren iş sayılır", async () => {
    const modules = await listModules();
    const kampanya = modules.find((m) => m.key === "kampanya")!;
    expect(kampanya.openWork?.count).toBeGreaterThanOrEqual(1);
    expect(kampanya.affectsPricing).toBe(true);
    expect(modules.find((m) => m.key === "prim")!.openWork).toBeNull();
  });

  it("kampanya kapalıyken hiçbir kampanya yüklenmez", async () => {
    const before = await loadEligiblePromotions(prisma, { companyId: "x", couponCode: null });
    expect(before.promotions.some((p) => p.id === promotionId)).toBe(true);

    closed.add("kampanya");
    try {
      const after = await loadEligiblePromotions(prisma, { companyId: "x", couponCode: null });
      expect(after.promotions).toEqual([]);
    } finally {
      closed.delete("kampanya");
    }
  });

  it("hacim kapalıyken elle sabitlenmiş basamak da uygulanmaz", async () => {
    const pinned = {
      id: "x",
      volumeDiscountMode: "MANUAL" as const,
      volumeTierId: tierId,
    };
    expect((await resolveVolumeDiscount(prisma, pinned))?.tierId).toBe(tierId);
    closed.add("hacim");
    try {
      expect(await resolveVolumeDiscount(prisma, pinned)).toBeNull();
    } finally {
      closed.delete("hacim");
    }
  });

  it("duyuru kapalıyken portal duyuru göstermez", async () => {
    expect((await listActiveAnnouncements(null)).some((a) => a.id === announcementId)).toBe(true);
    closed.add("duyuru");
    try {
      expect(await listActiveAnnouncements(null)).toEqual([]);
    } finally {
      closed.delete("duyuru");
    }
  });

  it("yerinde kalan izin 'verilmiş' sayılmaz, yeni verilen sayılır", async () => {
    // Yönetici: çek modülü kapalı olduğu için etkin kümesinde cheques.manage yok.
    const admin = await prisma.user.create({
      data: {
        email: `mod-admin-${TAG}@test.local`,
        name: "Modül yöneticisi",
        passwordHash: "x",
        role: "SUPER_ADMIN",
      },
    });
    const staff = await prisma.user.create({
      data: {
        email: `mod-staff-${TAG}@test.local`,
        name: "Kasa personeli",
        passwordHash: "x",
        role: "SUPER_ADMIN",
        permissions: ["cash.view", "cheques.manage"],
      },
    });
    userIds.push(admin.id, staff.id);

    const ctx = {
      userId: admin.id,
      email: admin.email,
      role: "SUPER_ADMIN" as const,
      companyId: null,
      permissions: effectivePermissions(defaultPermissionsFor("SUPER_ADMIN"), ["cek"]),
    };

    // Liste aynen geri geliyor, üstüne bir izin ekleniyor: kabul.
    const updated = await updateUser(
      staff.id,
      { permissions: ["cash.view", "cheques.manage", "cash.manage"] },
      ctx,
    );
    expect(updated.permissions).toEqual(
      expect.arrayContaining(["cash.view", "cheques.manage", "cash.manage"]),
    );

    // Yöneticide olmayan bir izni **yeni** vermek hâlâ reddediliyor.
    const other = await prisma.user.create({
      data: {
        email: `mod-other-${TAG}@test.local`,
        name: "Yeni personel",
        passwordHash: "x",
        role: "SUPER_ADMIN",
        permissions: ["cash.view"],
      },
    });
    userIds.push(other.id);
    await expect(
      updateUser(other.id, { permissions: ["cash.view", "cheques.manage"] }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
