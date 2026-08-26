import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { currentStep, SECRET_KEY_ENV, totpCodeForStep } from "@repo/services";
import { GET as getOrders } from "@/app/api/orders/route";
import {
  DELETE as deleteTwoFactor,
  GET as getTwoFactor,
  POST as beginTwoFactor,
} from "@/app/api/account/two-factor/route";
import { POST as confirmTwoFactor } from "@/app/api/account/two-factor/confirm/route";
import { POST as regenerateBackupCodes } from "@/app/api/account/two-factor/backup-codes/route";
import { DELETE as resetTwoFactorFor } from "@/app/api/admin/users/[id]/two-factor/route";
import { bearer, callRoute, Fixtures, hasDb, type TestUser } from "./harness";

// İkinci adımın rota tarafı. Servis matematiği (`packages/services`) zaten
// testli; burada kanıtlanan şey, o matematiğin bir HTTP isteğinde ne yaptığı:
//
//  - zorunlu kapsamdaki hesap **kurulumdan başka hiçbir şey** yapamıyor,
//  - kurulum uçları o kapıdan muaf — yoksa hesap kendi kurulum ekranına da
//    giremez ve kalıcı olarak kilitlenirdi,
//  - şifreleme anahtarı yokken kapı **açık** kalıyor (kurulamayan bir şeyi
//    zorunlu tutmak, yöneticiyi çıkışsız odada bırakır),
//  - harcanan kod bir daha geçmiyor,
//  - yönetici sıfırlaması firma sınırını aşamıyor.
//
// Anahtar burada testin kendisi tarafından kuruluyor: `secretBoxReady()` her
// çağrıda ortamı okuduğu için, anahtarsız kurulumun davranışını da aynı dosyada
// göstermek mümkün.

const fx = new Fixtures("twofa");
const suite = hasDb ? describe : describe.skip;

/** 32 baytlık sabit anahtar — testlerin şifreli sırrı açabilmesi için yeter. */
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

let admin: TestUser;
let staff: TestUser;
let companyId: string;

/** Elle giriş anahtarı 4'erli gruplanmış gelir; base32 sır boşluksuz hâli. */
function secretFrom(manualKey: string): string {
  return manualKey.replace(/\s+/g, "");
}

function codeAt(secret: string, stepOffset = 0): string {
  return totpCodeForStep(secret, currentStep() + stepOffset);
}

/** Aynı uzunlukta ama kesinlikle tutmayan kod. */
function wrongCode(correct: string): string {
  const first = correct[0] === "0" ? "1" : "0";
  return `${first}${correct.slice(1)}`;
}

/** tokenVersion her açma/kapama/sıfırlamada artıyor; jeton tazelenmeli. */
async function freshToken(user: TestUser): Promise<string> {
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { tokenVersion: true },
  });
  return bearer({ ...user, tokenVersion: row.tokenVersion });
}

/** Kurulumu uçlardan geçirerek aç; dönen yedek kodları verir. */
async function enrol(user: TestUser): Promise<{
  secret: string;
  backupCodes: string[];
}> {
  const token = await freshToken(user);
  const begin = await callRoute(beginTwoFactor, {
    url: "/api/account/two-factor",
    method: "POST",
    token,
  });
  expect(begin.status).toBe(200);
  const secret = secretFrom(begin.body.enrollment.manualKey);

  const confirm = await callRoute(confirmTwoFactor, {
    url: "/api/account/two-factor/confirm",
    method: "POST",
    token,
    body: { code: codeAt(secret) },
  });
  expect(confirm.status).toBe(200);
  return { secret, backupCodes: confirm.body.backupCodes };
}

suite("iki adımlı doğrulama: rota tarafı", () => {
  beforeAll(async () => {
    process.env[SECRET_KEY_ENV] = TEST_KEY;
    admin = await fx.user("SUPER_ADMIN");
    companyId = await fx.company();
    staff = await fx.user("COMPANY_STAFF", { companyId });
  });

  afterAll(async () => {
    delete process.env[SECRET_KEY_ENV];
    await fx.teardown();
  });

  describe("kapı", () => {
    it("zorunlu kapsamdaki hesap kurulumu yapmadan hiçbir uca giremez", async () => {
      const res = await callRoute(getOrders, {
        url: "/api/orders",
        token: await freshToken(admin),
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("TOTP_SETUP_REQUIRED");
    });

    it("kurulum ucu kapıdan muaf — yoksa hesap kendi kurulumuna da giremezdi", async () => {
      const res = await callRoute(getTwoFactor, {
        url: "/api/account/two-factor",
        token: await freshToken(admin),
      });
      expect(res.status).toBe(200);
      expect(res.body.twoFactor.required).toBe(true);
      expect(res.body.twoFactor.enabled).toBe(false);
      expect(res.body.twoFactor.ready).toBe(true);
    });

    it("zorunlu olmayan hesap kurulumsuz çalışmaya devam eder", async () => {
      const res = await callRoute(getOrders, {
        url: `/api/orders?companyId=${companyId}`,
        token: await freshToken(staff),
      });
      expect(res.status).toBe(200);
    });

    it("şifreleme anahtarı yokken kapı kapanmaz", async () => {
      // Anahtarsız kurulumda engellemek, yöneticiyi çıkışı olmayan bir odaya
      // kilitler: ikinci adımı kuramaz (kurmak da anahtar ister) ve anahtarı
      // koyacağı ekrana da giremez.
      delete process.env[SECRET_KEY_ENV];
      try {
        const res = await callRoute(getOrders, {
          url: "/api/orders",
          token: await freshToken(admin),
        });
        expect(res.status).toBe(200);
      } finally {
        process.env[SECRET_KEY_ENV] = TEST_KEY;
      }
    });

    it("kurulum tamamlanınca kapı açılır", async () => {
      await enrol(admin);
      const res = await callRoute(getOrders, {
        url: "/api/orders",
        token: await freshToken(admin),
      });
      expect(res.status).toBe(200);
    });
  });

  describe("kurulum", () => {
    it("QR sunucuda çiziliyor, dışarıya adres göndermeden", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "qr",
      });
      const res = await callRoute(beginTwoFactor, {
        url: "/api/account/two-factor",
        method: "POST",
        token: await freshToken(user),
      });
      expect(res.status).toBe(200);
      expect(res.body.enrollment.qrSvg.startsWith("<svg")).toBe(true);
      expect(res.body.enrollment.otpauthUri.startsWith("otpauth://totp/")).toBe(
        true,
      );
      // Sır düz metin olarak saklanmıyor: kayıttaki değer mühürlü biçimde.
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { totpSecret: true, totpEnabledAt: true },
      });
      expect(row.totpSecret).toMatch(/^v1\./);
      expect(row.totpSecret).not.toContain(
        secretFrom(res.body.enrollment.manualKey),
      );
      // Doğrulanmamış kurulum hesabı ikinci adıma tabi kılmaz.
      expect(row.totpEnabledAt).toBeNull();
    });

    it("hatalı kod kurulumu açmaz ve 500 değil 403 döner", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "wrongcode",
      });
      const token = await freshToken(user);
      const begin = await callRoute(beginTwoFactor, {
        url: "/api/account/two-factor",
        method: "POST",
        token,
      });
      const secret = secretFrom(begin.body.enrollment.manualKey);

      const res = await callRoute(confirmTwoFactor, {
        url: "/api/account/two-factor/confirm",
        method: "POST",
        token,
        body: { code: wrongCode(codeAt(secret)) },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("KOD_HATALI");
      // Kullanıcı ne yapacağını mesajdan öğreniyor; 500 "Sunucu hatası" bunu
      // gizliyordu.
      expect(res.body.error).toContain("saat");

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { totpEnabledAt: true },
      });
      expect(row.totpEnabledAt).toBeNull();
    });

    it("kurulum yokken doğrulama çağrısı çakılmaz, sebebini söyler", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "nosetup",
      });
      const res = await callRoute(confirmTwoFactor, {
        url: "/api/account/two-factor/confirm",
        method: "POST",
        token: await freshToken(user),
        body: { code: "123456" },
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("KURULUM_YOK");
    });

    it("doğru kod açar, yedek kodları bir kez verir ve oturumları düşürür", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "enable",
      });
      const oldToken = await freshToken(user);
      const { backupCodes } = await enrol(user);

      expect(backupCodes).toHaveLength(10);
      expect(new Set(backupCodes).size).toBe(10);

      // Açılış tokenVersion'ı artırdı: eski jeton artık ölü.
      const dead = await callRoute(getTwoFactor, {
        url: "/api/account/two-factor",
        token: oldToken,
      });
      expect(dead.status).toBe(401);
      expect(dead.body.code).toBe("SESSION_REVOKED");

      const status = await callRoute(getTwoFactor, {
        url: "/api/account/two-factor",
        token: await freshToken(user),
      });
      expect(status.body.twoFactor.enabled).toBe(true);
      expect(status.body.twoFactor.remainingBackupCodes).toBe(10);

      // Saklanan şey kodların kendisi değil, özetleri.
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { totpBackupCodes: true },
      });
      expect(row.totpBackupCodes).not.toContain(backupCodes[0]);
    });

    it("açıkken yeniden kurulum başlatılamaz", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "again",
      });
      await enrol(user);
      const res = await callRoute(beginTwoFactor, {
        url: "/api/account/two-factor",
        method: "POST",
        token: await freshToken(user),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ZATEN_ACIK");
    });
  });

  describe("kod harcama", () => {
    it("kurulumda kullanılan kod ikinci kez geçmez", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "replay",
      });
      const { secret } = await enrol(user);

      const res = await callRoute(deleteTwoFactor, {
        url: "/api/account/two-factor",
        method: "DELETE",
        token: await freshToken(user),
        body: { code: codeAt(secret) },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("KOD_HATALI");

      // Hesap hâlâ açık: tekrar oynatma denemesi kapatmayı başaramadı.
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { totpEnabledAt: true },
      });
      expect(row.totpEnabledAt).not.toBeNull();
    });

    it("yedek kod bir kez harcanır", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "backup",
      });
      const { backupCodes } = await enrol(user);
      const used = backupCodes[0]!;

      const spend = await callRoute(deleteTwoFactor, {
        url: "/api/account/two-factor",
        method: "DELETE",
        token: await freshToken(user),
        body: { code: used },
      });
      expect(spend.status).toBe(200);
      expect(spend.body.sessionRevoked).toBe(true);

      // Kapandı; aynı kodla ikinci bir işlem yapılacak bir şey kalmadı.
      const status = await callRoute(getTwoFactor, {
        url: "/api/account/two-factor",
        token: await freshToken(user),
      });
      expect(status.body.twoFactor.enabled).toBe(false);
      expect(status.body.twoFactor.remainingBackupCodes).toBe(0);
    });

    it("yedek kod yenileme eskileri geçersiz kılar", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "regen",
      });
      const { backupCodes } = await enrol(user);
      const old = backupCodes[0]!;

      const regen = await callRoute(regenerateBackupCodes, {
        url: "/api/account/two-factor/backup-codes",
        method: "POST",
        token: await freshToken(user),
        body: { code: old },
      });
      expect(regen.status).toBe(200);
      expect(regen.body.backupCodes).toHaveLength(10);
      expect(regen.body.backupCodes).not.toContain(old);

      const reuse = await callRoute(deleteTwoFactor, {
        url: "/api/account/two-factor",
        method: "DELETE",
        token: await freshToken(user),
        body: { code: old },
      });
      expect(reuse.status).toBe(403);
      expect(reuse.body.code).toBe("KOD_HATALI");
    });

    it("kapalı hesapta yedek kod yenilenemez", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "regenoff",
      });
      const res = await callRoute(regenerateBackupCodes, {
        url: "/api/account/two-factor/backup-codes",
        method: "POST",
        token: await freshToken(user),
        body: { code: "123456" },
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("KAPALI");
    });
  });

  describe("kapatma", () => {
    it("zorunlu kapsamdaki hesap kendi ikinci adımını kapatamaz", async () => {
      // admin ("kapı" bloğunda) kuruldu; kapatabilseydi zorunluluk öneriye
      // dönerdi.
      const res = await callRoute(deleteTwoFactor, {
        url: "/api/account/two-factor",
        method: "DELETE",
        token: await freshToken(admin),
        body: { code: "123456" },
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ZORUNLU");
    });

    it("zorunlu olmayan hesap geçerli kodla kapatır", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "disable",
      });
      const { secret } = await enrol(user);

      const res = await callRoute(deleteTwoFactor, {
        url: "/api/account/two-factor",
        method: "DELETE",
        token: await freshToken(user),
        // Kurulumdaki adım harcandı; sıradaki pencerenin kodu.
        body: { code: codeAt(secret, 1) },
      });
      expect(res.status).toBe(200);
      expect(res.body.sessionRevoked).toBe(true);

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { totpSecret: true, totpEnabledAt: true, totpBackupCodes: true },
      });
      expect(row.totpSecret).toBeNull();
      expect(row.totpEnabledAt).toBeNull();
      expect(row.totpBackupCodes).toEqual([]);
    });
  });

  describe("yönetici sıfırlaması", () => {
    it("süper admin kaybolan cihazı sıfırlar, hesap kurulum ekranına düşer", async () => {
      const target = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "resetme",
      });
      await enrol(target);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { tokenVersion: true },
      });

      const res = await callRoute(resetTwoFactorFor, {
        url: `/api/admin/users/${target.id}/two-factor`,
        method: "DELETE",
        token: await freshToken(admin),
        params: { id: target.id },
      });
      expect(res.status).toBe(204);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { totpSecret: true, totpEnabledAt: true, tokenVersion: true },
      });
      expect(after.totpSecret).toBeNull();
      expect(after.totpEnabledAt).toBeNull();
      // Sıfırlama hedefin oturumlarını da düşürür.
      expect(after.tokenVersion).toBeGreaterThan(before.tokenVersion);
    });

    it("firma yöneticisi başka firmanın hesabını sıfırlayamaz", async () => {
      const otherCompanyId = await fx.company({ label: "Diğer" });
      const otherUser = await fx.user("COMPANY_STAFF", {
        companyId: otherCompanyId,
        label: "outsider",
      });
      await enrol(otherUser);

      const companyAdmin = await fx.user("COMPANY_ADMIN", { companyId });
      // Firma yöneticisi zorunlu kapsamda: kapı, kapsam kontrolünden önce
      // çalışır ve testin ölçmek istediği şeyi gizlerdi.
      await enrol(companyAdmin);

      const res = await callRoute(resetTwoFactorFor, {
        url: `/api/admin/users/${otherUser.id}/two-factor`,
        method: "DELETE",
        token: await freshToken(companyAdmin),
        params: { id: otherUser.id },
      });
      // Kapsam dışı hedef: `getUser` FORBIDDEN atıyor — rota kendi başına
      // yalnızca `users.manage` iznine bakıyor, sınırı servis çiziyor.
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: otherUser.id },
        select: { totpEnabledAt: true },
      });
      expect(row.totpEnabledAt).not.toBeNull();
    });

    it("ikinci adımı olmayan hesap sıfırlanamaz", async () => {
      const target = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "noreset",
      });
      const res = await callRoute(resetTwoFactorFor, {
        url: `/api/admin/users/${target.id}/two-factor`,
        method: "DELETE",
        token: await freshToken(admin),
        params: { id: target.id },
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("KAPALI");
    });
  });

  describe("anahtar kurulu değilse", () => {
    it("kurulum başlatma sunucu hatası değil 503 döner", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "nokey",
      });
      const token = await freshToken(user);
      delete process.env[SECRET_KEY_ENV];
      try {
        const res = await callRoute(beginTwoFactor, {
          url: "/api/account/two-factor",
          method: "POST",
          token,
        });
        expect(res.status).toBe(503);
        expect(res.body.code).toBe("ANAHTAR_YOK");
        expect(res.body.error).toContain(SECRET_KEY_ENV);
      } finally {
        process.env[SECRET_KEY_ENV] = TEST_KEY;
      }
    });

    it("durum ekranı anahtarın eksikliğini söyler", async () => {
      const user = await fx.user("COMPANY_STAFF", {
        companyId,
        label: "nokeystatus",
      });
      const token = await freshToken(user);
      delete process.env[SECRET_KEY_ENV];
      try {
        const res = await callRoute(getTwoFactor, {
          url: "/api/account/two-factor",
          token,
        });
        expect(res.status).toBe(200);
        expect(res.body.twoFactor.ready).toBe(false);
      } finally {
        process.env[SECRET_KEY_ENV] = TEST_KEY;
      }
    });
  });
});
