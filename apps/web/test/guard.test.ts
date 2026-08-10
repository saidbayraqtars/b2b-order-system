import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { GET as getOrders } from "@/app/api/orders/route";
import { GET as getAdminProducts } from "@/app/api/admin/products/route";
import { GET as getCompanies } from "@/app/api/companies/route";
import { GET as getDeliveries } from "@/app/api/deliveries/route";
import {
  bearer,
  callRoute,
  cookieSession,
  Fixtures,
  hasDb,
  type TestUser,
} from "./harness";

// The guard is the one piece of code every one of the 119 endpoints runs
// before anything else, and until now nothing tested it. What follows is not
// "does a logged-in user get a 200" — it is the set of claims the guard is
// supposed to disbelieve: a token whose account was deleted, deactivated or
// demoted, and a cookie that simply says it is an administrator.

const fx = new Fixtures("guard");
const suite = hasDb ? describe : describe.skip;

let admin: TestUser;
let staff: TestUser;
let rep: TestUser;
let companyId: string;

suite("guard: kimlik ve yetki sınırı", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    rep = await fx.user("SALES_REP");
    companyId = await fx.company({ salesRepId: rep.id });
    staff = await fx.user("COMPANY_STAFF", { companyId });
  });

  afterAll(() => fx.teardown());

  describe("kimlik yoksa", () => {
    it("kimliksiz istek 401 döner", async () => {
      const res = await callRoute(getOrders, { url: "/api/orders" });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("NO_SESSION");
    });

    it("bozuk jeton oturum sayılmaz", async () => {
      const res = await callRoute(getOrders, {
        url: "/api/orders",
        token: "bu.bir.jeton.degil",
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("NO_SESSION");
    });

    it("başka anahtarla imzalanmış jeton reddedilir", async () => {
      // Doğru şekil, doğru alanlar, yanlış imza. Kabul edilseydi jetonu
      // imzalayan herkes kendine SUPER_ADMIN yazabilirdi.
      const forged = await new SignJWT({
        email: admin.email,
        name: admin.name,
        role: "SUPER_ADMIN",
        companyId: null,
        v: admin.tokenVersion,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(admin.id)
        .setIssuer("b2b-mobile")
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(new TextEncoder().encode("sahte-anahtar-baska-birinin"));

      const res = await callRoute(getOrders, { url: "/api/orders", token: forged });
      expect(res.status).toBe(401);
    });

    it("başka bir uygulamanın jetonu (issuer) reddedilir", async () => {
      const foreign = await new SignJWT({
        email: admin.email,
        name: admin.name,
        role: "SUPER_ADMIN",
        companyId: null,
        v: admin.tokenVersion,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(admin.id)
        .setIssuer("baska-uygulama")
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(new TextEncoder().encode(process.env.AUTH_SECRET ?? "b2b-dev-secret-degistir"));

      const res = await callRoute(getOrders, { url: "/api/orders", token: foreign });
      expect(res.status).toBe(401);
    });
  });

  describe("jeton geçerli ama hesap değil", () => {
    it("silinmiş hesabın jetonu 401 ACCOUNT_MISSING", async () => {
      const ghost = await fx.user("SUPER_ADMIN", { label: "hayalet" });
      const token = await bearer(ghost);
      await prisma.user.delete({ where: { id: ghost.id } });

      const res = await callRoute(getOrders, { url: "/api/orders", token });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("ACCOUNT_MISSING");

      // Ve kayda geçer. Aktör satırı yok, yabancı anahtar bu yüzden boş kalır;
      // kimin jetonu olduğunu söyleyen şey kopyalanmış e-postadır.
      const log = await prisma.auditLog.findFirst({
        where: { actorEmail: ghost.email, action: "SESSION_REVOKED" },
        orderBy: { createdAt: "desc" },
      });
      expect(log).not.toBeNull();
      expect(log!.actorId).toBeNull();
      expect(log!.meta).toMatchObject({ rejection: "UNKNOWN" });
      await prisma.auditLog.delete({ where: { id: log!.id } });
    });

    it("pasife alınmış hesap 401 ACCOUNT_DISABLED", async () => {
      const disabled = await fx.user("SUPER_ADMIN", {
        isActive: false,
        label: "pasif",
      });
      const res = await callRoute(getOrders, {
        url: "/api/orders",
        token: await bearer(disabled),
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("ACCOUNT_DISABLED");
    });

    it("sürümü geçmiş jeton 401 SESSION_REVOKED", async () => {
      // Oturum iptali tam olarak budur: satırdaki tokenVersion artar, elde
      // kalan jeton bir sonraki istekte ölür. 30 günlük mobil jetonun
      // geri alınabilmesinin tek yolu.
      const user = await fx.user("SUPER_ADMIN", { label: "iptal" });
      const stale = await bearer(user, { tokenVersion: user.tokenVersion });
      await prisma.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      });

      const res = await callRoute(getOrders, { url: "/api/orders", token: stale });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("SESSION_REVOKED");
    });
  });

  describe("çerez ne derse desin, satır ne diyorsa o", () => {
    it("SUPER_ADMIN iddia eden çerez yönetici ucunu açmaz", async () => {
      // Auth.js çerezinin içeriği istemcide değil ama iddiası da kanıt değil:
      // rol her istekte satırdan okunur.
      const res = await callRoute(getAdminProducts, {
        url: "/api/admin/products",
        session: cookieSession(staff, { role: "SUPER_ADMIN" }),
      });
      expect(res.status).toBe(403);
    });

    it("çerezdeki companyId değil, hesabın firması geçerlidir", async () => {
      const otherCompanyId = await fx.company({ label: "Yabanci" });
      const manager = await fx.user("COMPANY_ADMIN", { companyId });
      const res = await callRoute(getCompanies, {
        url: "/api/companies",
        session: cookieSession(manager, { companyId: otherCompanyId }),
      });
      expect(res.status).toBe(200);
      const ids = res.body.companies.map((c: { id: string }) => c.id);
      expect(ids).toEqual([companyId]);
      expect(ids).not.toContain(otherCompanyId);
    });

    it("geçerli çerez normal yolda çalışır", async () => {
      const res = await callRoute(getOrders, {
        url: "/api/orders",
        session: cookieSession(staff),
      });
      expect(res.status).toBe(200);
    });

    it("çerezdeki tokenVersion da doğrulanır", async () => {
      const res = await callRoute(getOrders, {
        url: "/api/orders",
        session: cookieSession(staff, { tokenVersion: staff.tokenVersion + 5 }),
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("SESSION_REVOKED");
    });
  });

  describe("izinler", () => {
    it("rol yeter ama izin yoksa 403 ve eksik izin söylenir", async () => {
      const strippedAdmin = await fx.user("SUPER_ADMIN", {
        permissions: ["companies.view"],
        label: "izinsiz",
      });
      const res = await callRoute(getAdminProducts, {
        url: "/api/admin/products",
        token: await bearer(strippedAdmin),
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      // Menüden tıklayan kişi neden reddedildiğini görmeli.
      expect(res.body.error).toMatch(/yetkiniz yok/i);
    });

    it("süper admin izin kapısından muaf değildir", async () => {
      // Bilerek: "her şeyi yapan ama kasaya giremeyen yönetici" gerçek bir
      // ihtiyaç, rol bypass'ı onu imkânsız kılardı.
      const noCash = await fx.user("SUPER_ADMIN", {
        permissions: null,
        label: "kasasiz",
      });
      const res = await callRoute(getCompanies, {
        url: "/api/companies",
        token: await bearer(noCash),
      });
      expect(res.status).toBe(403);
    });

    it("izin reddi denetim kaydına yazılır", async () => {
      const denied = await fx.user("SUPER_ADMIN", {
        permissions: null,
        label: "denetim",
      });
      await callRoute(getAdminProducts, {
        url: "/api/admin/products",
        token: await bearer(denied),
        headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      });

      const log = await prisma.auditLog.findFirst({
        where: { actorId: denied.id, action: "ACCESS_DENIED" },
        orderBy: { createdAt: "desc" },
      });
      expect(log).not.toBeNull();
      expect(log!.actorEmail).toBe(denied.email);
      // Vekil zincirinin yalnız ilk adımı tutulur.
      expect(log!.ip).toBe("203.0.113.9");
      expect(log!.meta).toMatchObject({ missingPermissions: ["products.view"] });
    });

    it("rol reddi de kaydedilir, izin reddinden ayrı", async () => {
      await callRoute(getAdminProducts, {
        url: "/api/admin/products",
        token: await bearer(staff),
      });
      const log = await prisma.auditLog.findFirst({
        where: { actorId: staff.id, action: "ACCESS_DENIED" },
        orderBy: { createdAt: "desc" },
      });
      expect(log).not.toBeNull();
      expect(log!.meta).toMatchObject({ actual: "COMPANY_STAFF" });
    });
  });

  describe("en az biri yeten izinler (requireAnyPermission)", () => {
    it("kurye teslim listesini açar", async () => {
      const courier = await fx.user("COURIER");
      const res = await callRoute(getDeliveries, {
        url: "/api/deliveries",
        token: await bearer(courier),
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.deliveries)).toBe(true);
      // Kurye atama yapamaz: kurye listesi ona boş döner, dolu değil.
      expect(res.body.couriers).toEqual([]);
    });

    it("sevkiyatı yöneten aynı ucu atama listesiyle görür", async () => {
      const dispatcher = await fx.user("SUPER_ADMIN", { label: "sevkiyat" });
      const res = await callRoute(getDeliveries, {
        url: "/api/deliveries",
        token: await bearer(dispatcher),
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.couriers)).toBe(true);
    });

    it("iki izinden hiçbiri yoksa 403", async () => {
      const res = await callRoute(getDeliveries, {
        url: "/api/deliveries",
        token: await bearer(rep),
      });
      expect(res.status).toBe(403);
    });
  });
});
