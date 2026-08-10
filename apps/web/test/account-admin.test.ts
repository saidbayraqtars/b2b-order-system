import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { POST as mobileLogin } from "@/app/api/mobile/login/route";
import { GET as getMe } from "@/app/api/mobile/me/route";
import { POST as createUser, GET as listUsers } from "@/app/api/admin/users/route";
import {
  DELETE as deleteUser,
  PATCH as patchUser,
} from "@/app/api/admin/users/[id]/route";
import { GET as getOrders } from "@/app/api/orders/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// Two things that decide who exists and what they may do: the endpoint that
// mints tokens, and the endpoints that hand out privileges.
//
// The escalation rules were written as service invariants ("nobody may grant a
// permission they do not hold themselves", "nobody may switch themselves off")
// and never checked through the door they are actually reachable from.

const fx = new Fixtures("acct");
const suite = hasDb ? describe : describe.skip;

const PASSWORD = "Sifre123!parola";

let admin: TestUser;
let manager: TestUser;
let companyId: string;
let otherCompanyId: string;

suite("hesap yönetimi ve mobil giriş (HTTP)", () => {
  beforeAll(async () => {
    admin = await fx.user("SUPER_ADMIN");
    companyId = await fx.company();
    otherCompanyId = await fx.company({ label: "Yabanci" });
    manager = await fx.user("COMPANY_ADMIN", { companyId });
  });

  afterAll(() => fx.teardown());

  describe("mobil giriş", () => {
    let loginUser: TestUser;

    beforeAll(async () => {
      loginUser = await fx.user("SALES_REP", { label: "girisyapan" });
      await prisma.user.update({
        where: { id: loginUser.id },
        data: { passwordHash: await hash(PASSWORD, 10) },
      });
    });

    it("doğru şifre jeton verir ve jeton işe yarar", async () => {
      const res = await callRoute(mobileLogin, {
        url: "/api/mobile/login",
        method: "POST",
        body: { email: loginUser.email, password: PASSWORD },
      });
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");

      const me = await callRoute(getMe, {
        url: "/api/mobile/me",
        token: res.body.token,
      });
      expect(me.status).toBe(200);
      expect(me.body.user.id).toBe(loginUser.id);
    });

    it("yanlış şifre ile bilinmeyen e-posta aynı cevabı verir", async () => {
      // Giriş formu kimin kayıtlı olduğunu söylememeli.
      const wrongPassword = await callRoute(mobileLogin, {
        url: "/api/mobile/login",
        method: "POST",
        body: { email: loginUser.email, password: "Yanlis123!parola" },
      });
      const unknownEmail = await callRoute(mobileLogin, {
        url: "/api/mobile/login",
        method: "POST",
        body: { email: `yok-${fx.tag}@test.local`, password: "Yanlis123!parola" },
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
    });

    it("pasif hesap giriş yapamaz", async () => {
      const disabled = await fx.user("SALES_REP", {
        isActive: false,
        label: "pasifgiris",
      });
      await prisma.user.update({
        where: { id: disabled.id },
        data: { passwordHash: await hash(PASSWORD, 10) },
      });

      const res = await callRoute(mobileLogin, {
        url: "/api/mobile/login",
        method: "POST",
        body: { email: disabled.email, password: PASSWORD },
      });
      expect(res.status).toBe(401);
    });

    it("başarılı giriş sayacı sıfırlar, hatalı giriş arttırır", async () => {
      await callRoute(mobileLogin, {
        url: "/api/mobile/login",
        method: "POST",
        body: { email: loginUser.email, password: "Yanlis123!parola" },
        headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` },
      });
      const afterFailure = await prisma.user.findUniqueOrThrow({
        where: { id: loginUser.id },
        select: { failedLoginCount: true },
      });
      expect(afterFailure.failedLoginCount).toBeGreaterThan(0);

      await callRoute(mobileLogin, {
        url: "/api/mobile/login",
        method: "POST",
        body: { email: loginUser.email, password: PASSWORD },
      });
      const afterSuccess = await prisma.user.findUniqueOrThrow({
        where: { id: loginUser.id },
        select: { failedLoginCount: true, lastLoginAt: true },
      });
      expect(afterSuccess.failedLoginCount).toBe(0);
      expect(afterSuccess.lastLoginAt).not.toBeNull();
    });
  });

  describe("yetki devri kendinden büyük olamaz", () => {
    it("sahip olmadığı izni veremez", async () => {
      const limited = await fx.user("SUPER_ADMIN", {
        permissions: ["users.manage", "orders.view"],
        label: "kisitli",
      });

      const res = await callRoute(createUser, {
        url: "/api/admin/users",
        method: "POST",
        body: {
          email: `yeni-${fx.tag}@test.local`,
          name: "Yeni Hesap",
          role: "SALES_REP",
          password: PASSWORD,
          permissions: ["users.manage", "cash.manage"],
        },
        token: await bearer(limited),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("kendinde olan izni verebilir", async () => {
      const res = await callRoute(createUser, {
        url: "/api/admin/users",
        method: "POST",
        body: {
          email: `plasiyer-${fx.tag}@test.local`,
          name: "Yeni Plasiyer",
          role: "SALES_REP",
          password: PASSWORD,
          permissions: ["orders.view", "companies.view"],
        },
        token: await bearer(admin),
      });
      expect(res.status).toBe(201);
      expect(res.body.user.permissions.sort()).toEqual([
        "companies.view",
        "orders.view",
      ]);
    });

    it("bayi yöneticisi sistem rolü açamaz", async () => {
      const res = await callRoute(createUser, {
        url: "/api/admin/users",
        method: "POST",
        body: {
          email: `sahte-admin-${fx.tag}@test.local`,
          name: "Sahte Admin",
          role: "SUPER_ADMIN",
          password: PASSWORD,
        },
        token: await bearer(manager),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("bayi yöneticisinin açtığı hesap kendi firmasına bağlanır", async () => {
      // Başka firma söylese bile: kapsamı çağıranın kendi satırı belirliyor.
      const res = await callRoute(createUser, {
        url: "/api/admin/users",
        method: "POST",
        body: {
          email: `personel-${fx.tag}@test.local`,
          name: "Yeni Personel",
          role: "COMPANY_STAFF",
          password: PASSWORD,
          companyId: otherCompanyId,
        },
        token: await bearer(manager),
      });
      if (res.status === 201) {
        expect(res.body.user.company?.id).toBe(companyId);
      } else {
        expect(res.status).toBeLessThan(500);
      }
    });
  });

  describe("kendini kilitleme koruması", () => {
    it("kendi kullanıcı yönetimi iznini alamaz", async () => {
      const res = await callRoute(patchUser, {
        url: `/api/admin/users/${admin.id}`,
        method: "PATCH",
        params: { id: admin.id },
        body: { permissions: ["orders.view"] },
        token: await bearer(admin),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: admin.id },
        select: { permissions: true },
      });
      expect(row.permissions).toContain("users.manage");
    });

    it("kendini pasife alamaz", async () => {
      const res = await callRoute(patchUser, {
        url: `/api/admin/users/${admin.id}`,
        method: "PATCH",
        params: { id: admin.id },
        body: { isActive: false },
        token: await bearer(admin),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("kendini silemez", async () => {
      const res = await callRoute(deleteUser, {
        url: `/api/admin/users/${admin.id}`,
        method: "DELETE",
        params: { id: admin.id },
        token: await bearer(admin),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("yetki değişikliği açık oturumu etkiler", () => {
    it("izni kısılan hesabın elindeki jeton bir sonraki istekte ölür", async () => {
      // Süresi 30 gün olan bir jetonun geri alınabilmesinin tek yolu:
      // yetki değişince tokenVersion artar ve jeton eskir.
      const victim = await fx.user("SALES_REP", { label: "kurban" });
      const token = await bearer(victim);

      const before = await callRoute(getOrders, { url: "/api/orders", token });
      expect(before.status).toBe(200);

      const patched = await callRoute(patchUser, {
        url: `/api/admin/users/${victim.id}`,
        method: "PATCH",
        params: { id: victim.id },
        body: { permissions: ["orders.view"] },
        token: await bearer(admin),
      });
      expect(patched.status).toBe(200);

      const after = await callRoute(getOrders, { url: "/api/orders", token });
      expect(after.status).toBe(401);
      expect(after.body.code).toBe("SESSION_REVOKED");
    });

    it("pasife alınan hesabın jetonu da ölür", async () => {
      const victim = await fx.user("SALES_REP", { label: "kapatilan" });
      const token = await bearer(victim);

      await callRoute(patchUser, {
        url: `/api/admin/users/${victim.id}`,
        method: "PATCH",
        params: { id: victim.id },
        body: { isActive: false },
        token: await bearer(admin),
      });

      const after = await callRoute(getOrders, { url: "/api/orders", token });
      expect(after.status).toBe(401);
      expect(["ACCOUNT_DISABLED", "SESSION_REVOKED"]).toContain(after.body.code);
    });
  });

  describe("liste", () => {
    it("pasif hesaplar istenmedikçe listelenmez", async () => {
      const hidden = await fx.user("COMPANY_STAFF", {
        companyId,
        isActive: false,
        label: "gizli",
      });

      const normal = await callRoute(listUsers, {
        url: `/api/admin/users?companyId=${companyId}`,
        token: await bearer(admin),
      });
      expect(normal.body.users.map((u: { id: string }) => u.id)).not.toContain(
        hidden.id,
      );

      const withInactive = await callRoute(listUsers, {
        url: `/api/admin/users?companyId=${companyId}&includeInactive=1`,
        token: await bearer(admin),
      });
      expect(withInactive.body.users.map((u: { id: string }) => u.id)).toContain(
        hidden.id,
      );
    });
  });
});
