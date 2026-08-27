import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  GET as listApplications,
  POST as submitApplication,
} from "@/app/api/dealer-applications/route";
import {
  GET as getApplication,
  POST as decideApplication,
} from "@/app/api/dealer-applications/[id]/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Bayi başvurusu, uçtan uca.
//
// Üç şeyi ayrı tutmak bu belgenin varlık sebebi ve testin de:
//
//  1. **Başvuru hesap değildir.** Form herkese açık ve satır yazıyor, ama o
//     satırla kimse giriş yapamaz. Hesap yalnızca onayla doğuyor.
//  2. **Form müşteri listesi sızdırmaz.** Kayıtlı bir e-postayla gönderilen
//     başvuru da, hız sınırına takılan da aynı cevabı alır — dışarıdan hangi
//     adresin sistemde olduğu okunamaz.
//  3. **Karar bir kez uygulanır.** Onay firma ve hesap açar; ikinci kez
//     uygulanması ikinci bir firma demek olurdu.

const fx = new Fixtures("basvuru");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
/** `applications.manage` izni alınmış süper admin — rol tek başına yetmiyor. */
let blindAdmin: TestUser;
let manager: TestUser;

/** Test boyunca açılan başvurular ve onların doğurduğu kayıtlar. */
const applicationIds: string[] = [];
const bornCompanyIds: string[] = [];
const bornUserIds: string[] = [];

/** Her senaryo kendi adresinden gelir: hız sınırı sayacı dosya içinde paylaşılmasın. */
function meta(ip: string) {
  return { "x-forwarded-for": ip };
}

function application(overrides: Record<string, unknown> = {}) {
  return {
    companyName: `Başvuru Firma ${fx.tag}`,
    city: "İstanbul",
    contactName: "Ayşe Yılmaz",
    email: `basvuru-${fx.tag}@test.local`,
    phone: "0532 000 00 00",
    consent: true,
    ...overrides,
  };
}

async function rowsFor(email: string) {
  return prisma.dealerApplication.findMany({
    where: { email },
    select: { id: true, status: true, createdCompanyId: true, createdUserId: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Gönder ve yazılan satırı hatırla (temizlik için). */
async function submit(body: unknown, ip: string) {
  const res = await callRoute(submitApplication, {
    url: "/api/dealer-applications",
    method: "POST",
    body,
    headers: meta(ip),
  });
  const email =
    body && typeof body === "object" && "email" in body
      ? String((body as { email: unknown }).email).toLowerCase()
      : null;
  if (email) {
    for (const row of await rowsFor(email)) {
      if (!applicationIds.includes(row.id)) applicationIds.push(row.id);
    }
  }
  return res;
}

suite("bayi başvurusu", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    blindAdmin = await fx.user("SUPER_ADMIN", {
      permissions: [],
      label: "yetkisizadmin",
    });
    const companyId = await fx.company();
    manager = await fx.user("COMPANY_ADMIN", { companyId });
  });

  afterAll(async () => {
    if (!hasDb) return;
    // Onayın doğurduğu kayıtlar Fixtures'ın defterinde yok — onları buradan
    // sürüyoruz. Sıra önemli: başvuru satırı firmaya ve kullanıcıya bakıyor.
    await prisma.dealerApplication.deleteMany({
      where: { id: { in: applicationIds } },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: bornUserIds } } });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: { in: bornUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: bornUserIds } } });
    await prisma.company.deleteMany({ where: { id: { in: bornCompanyIds } } });
    await fx.teardown();
  });

  describe("gönderim — oturumsuz", () => {
    it("oturum olmadan başvuru kabul edilir ve satır yazılır", async () => {
      const email = `acik-${fx.tag}@test.local`;
      const res = await submit(application({ email }), "203.0.113.10");

      expect(res.status).toBe(202);
      expect(res.body.message).toMatch(/alındı/i);

      const rows = await rowsFor(email);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("PENDING");
      // Başvuru hiçbir hesap açmaz — testin en önemli satırı.
      expect(rows[0]!.createdUserId).toBeNull();
      await expect(
        prisma.user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });

    it("onay kutusu işaretlenmemişse 400", async () => {
      const res = await submit(
        application({ email: `onaysiz-${fx.tag}@test.local`, consent: false }),
        "203.0.113.11",
      );
      expect(res.status).toBe(400);
    });

    it("geçersiz e-posta 400", async () => {
      const res = await submit(
        application({ email: "bu-bir-adres-degil" }),
        "203.0.113.12",
      );
      expect(res.status).toBe(400);
    });

    it("aynı e-postayla ikinci başvuru aynı cevabı alır ama ikinci satır açmaz", async () => {
      const email = `tekrar-${fx.tag}@test.local`;
      const first = await submit(application({ email }), "203.0.113.13");
      const second = await submit(application({ email }), "203.0.113.14");

      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      expect(second.body.message).toBe(first.body.message);
      expect(await rowsFor(email)).toHaveLength(1);
    });

    it("kayıtlı bir kullanıcının adresi de aynı cevabı alır, satır yazılmaz", async () => {
      // Bu, formun müşteri listesi sorgulayan bir araca dönüşmesini engelleyen
      // kural: cevap "zaten kayıtlısınız" olsaydı, uç kayıtlı adresleri tek tek
      // doğrulamaya yarardı.
      const res = await submit(
        application({ email: manager.email }),
        "203.0.113.15",
      );
      expect(res.status).toBe(202);
      expect(await rowsFor(manager.email)).toHaveLength(0);
    });

    it("aynı adresten gelen altıncı başvuru sessizce düşer", async () => {
      const ip = "203.0.113.99";
      for (let i = 0; i < 5; i++) {
        const res = await submit(
          application({ email: `yagmur${i}-${fx.tag}@test.local` }),
          ip,
        );
        expect(res.status).toBe(202);
      }

      const email = `yagmur-son-${fx.tag}@test.local`;
      const res = await submit(application({ email }), ip);
      // Cevap yine aynı: sınıra takıldığı dışarıdan anlaşılmıyor.
      expect(res.status).toBe(202);
      expect(await rowsFor(email)).toHaveLength(0);
    });
  });

  describe("liste — yetki", () => {
    it("oturumsuz liste 401", async () => {
      const res = await callRoute(listApplications, {
        url: "/api/dealer-applications",
      });
      expect(res.status).toBe(401);
    });

    it("bayi yöneticisi listeyi göremez", async () => {
      const res = await callRoute(listApplications, {
        url: "/api/dealer-applications",
        token: await bearer(manager),
      });
      expect(res.status).toBe(403);
    });

    it("izni alınmış süper admin de göremez — rol tek başına yetmez", async () => {
      const res = await callRoute(listApplications, {
        url: "/api/dealer-applications",
        token: await bearer(blindAdmin),
      });
      expect(res.status).toBe(403);
    });

    it("applications.manage ile listelenir", async () => {
      const res = await callRoute(listApplications, {
        url: "/api/dealer-applications?status=PENDING",
        token: await bearer(admin),
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.applications)).toBe(true);
    });
  });

  describe("karar", () => {
    async function pending(email: string, ip: string): Promise<string> {
      await submit(application({ email }), ip);
      const rows = await rowsFor(email);
      return rows[0]!.id;
    }

    it("onay firma ve yönetici hesabı açar, şifre üretmez", async () => {
      const email = `onay-${fx.tag}@test.local`;
      const id = await pending(email, "198.51.100.10");

      const res = await callRoute(decideApplication, {
        url: `/api/dealer-applications/${id}`,
        method: "POST",
        params: { id },
        body: {
          decision: "APPROVE",
          creditLimit: 25000,
          paymentTermDays: 30,
          requiresOrderApproval: false,
        },
        token: await bearer(admin),
      });
      expect(res.status).toBe(200);
      expect(res.body.application.status).toBe("APPROVED");

      const row = (await rowsFor(email))[0]!;
      expect(row.createdCompanyId).toBeTruthy();
      expect(row.createdUserId).toBeTruthy();
      bornCompanyIds.push(row.createdCompanyId!);
      bornUserIds.push(row.createdUserId!);

      const company = await prisma.company.findUnique({
        where: { id: row.createdCompanyId! },
        select: { creditLimit: true, paymentTermDays: true },
      });
      expect(Number(company!.creditLimit)).toBe(25000);
      expect(company!.paymentTermDays).toBe(30);

      const user = await prisma.user.findUnique({
        where: { id: row.createdUserId! },
        select: { role: true, companyId: true, permissions: true, isActive: true },
      });
      expect(user!.role).toBe("COMPANY_ADMIN");
      expect(user!.companyId).toBe(row.createdCompanyId);
      expect(user!.isActive).toBe(true);
      // DEALER ailesine kapalı bir izin sızmamalı.
      expect(user!.permissions).not.toContain("products.manage");
      expect(user!.permissions).toContain("orders.create");

      // İçeri giren tek yol tek kullanımlık bağlantı: e-postaya şifre yazılmıyor.
      const tickets = await prisma.passwordResetToken.count({
        where: { userId: row.createdUserId!, usedAt: null },
      });
      expect(tickets).toBe(1);
    });

    it("aynı başvuru ikinci kez karara bağlanamaz", async () => {
      const email = `ikinci-${fx.tag}@test.local`;
      const id = await pending(email, "198.51.100.11");

      const first = await callRoute(decideApplication, {
        url: `/api/dealer-applications/${id}`,
        method: "POST",
        params: { id },
        body: { decision: "REJECT", note: "Bölge dolu" },
        token: await bearer(admin),
      });
      expect(first.status).toBe(200);

      const second = await callRoute(decideApplication, {
        url: `/api/dealer-applications/${id}`,
        method: "POST",
        params: { id },
        body: { decision: "APPROVE", creditLimit: 0, paymentTermDays: 0 },
        token: await bearer(admin),
      });
      expect(second.status).toBe(409);
      expect(second.body.code).toBe("APPLICATION_ALREADY_DECIDED");

      // Ret hiçbir hesap açmamış olmalı.
      await expect(
        prisma.user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });

    it("gerekçesiz ret 400", async () => {
      const email = `gerekcesiz-${fx.tag}@test.local`;
      const id = await pending(email, "198.51.100.12");

      const res = await callRoute(decideApplication, {
        url: `/api/dealer-applications/${id}`,
        method: "POST",
        params: { id },
        body: { decision: "REJECT", note: "" },
        token: await bearer(admin),
      });
      expect(res.status).toBe(400);
    });

    it("bayi yöneticisi karar veremez", async () => {
      const email = `yetkisiz-${fx.tag}@test.local`;
      const id = await pending(email, "198.51.100.13");

      const res = await callRoute(decideApplication, {
        url: `/api/dealer-applications/${id}`,
        method: "POST",
        params: { id },
        body: { decision: "APPROVE", creditLimit: 0, paymentTermDays: 0 },
        token: await bearer(manager),
      });
      expect(res.status).toBe(403);
    });

    it("olmayan başvuru 404", async () => {
      const id = "cly000000000000000000000";
      const res = await callRoute(getApplication, {
        url: `/api/dealer-applications/${id}`,
        params: { id },
        token: await bearer(admin),
      });
      expect(res.status).toBe(404);
    });
  });
});
