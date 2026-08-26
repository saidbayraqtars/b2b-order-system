import crypto from "node:crypto";
import { prisma } from "@repo/database";
import type { Permission, Role } from "@repo/types";
import { recordAudit, type RequestMeta } from "./audit";
import { evictPrincipal } from "./principal-cache";
import { qrSvg } from "./qr";
import { openSecret, sealSecret, secretBoxReady } from "./secret-box";
import { loadTenant } from "./tenant";
import { getUser, type UserAdminContext } from "./user-admin";
import {
  formatSecretForDisplay,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from "./totp";

// İki adımlı doğrulama — hesap tarafı.
//
// `totp.ts` algoritmayı, `secret-box.ts` anahtarın saklanmasını yapar; burası
// **politikayı** tutar: kim zorunlu, kurulum nasıl doğrulanır, yedek kod nasıl
// harcanır, hangi olay denetime yazılır.
//
// Mevcut oturum modeline binen tek yer `tokenVersion`: ikinci adım açıldığında
// ya da kapandığında hesabın savunması değişir, o yüzden o ana kadar verilmiş
// bütün oturumlar ölür. Bu, [[b2b-security]]'deki kuralın aynısı — yetkiyi
// değiştiren her yazma sürümü artırır.

// ─────────────────────────────────────────────
// politika: kim zorunlu
// ─────────────────────────────────────────────

/**
 * İkinci adımın zorunlu olduğu roller.
 *
 * Ölçüt "kıdem" değil, **ele geçirilirse ne kaybedilir**: bu iki rol kullanıcı
 * açabilir, yetki verebilir ve firma verisinin tamamını görebilir.
 */
export const TWO_FACTOR_REQUIRED_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
];

/**
 * Rolü ne olursa olsun ikinci adımı zorunlu kılan izinler.
 *
 * İki küme var ve ikisi de bilinçli:
 *  - **Para**: kasa, çek, tahsilat, vade. Bu izinler doğrudan tahsilat kaydı
 *    doğurur ya da borcu değiştirir.
 *  - **Yetki ve dış sistem**: `users.manage` başkasına yetki verebilir
 *    (kendine veremez, bkz. user-admin.ts — ama bir suç ortağı hesabı
 *    yükseltmek yeterlidir); `erp.push` müşterinin kendi muhasebe
 *    veritabanına yazar; `system.update` sunucudaki sürümü değiştirir.
 *
 * Salt okuma izinleri (`cash.view`, `payments.view`) **bilerek dışarıda**:
 * zorunluluğu görüntüleme yetkisine kadar genişletmek neredeyse tüm ofis
 * personelini kapsar ve kararın kapsamını ("yüksek riskli roller") aşardı.
 */
export const TWO_FACTOR_REQUIRED_PERMISSIONS: readonly Permission[] = [
  "cash.manage",
  "cheques.manage",
  "payment_terms.manage",
  "users.manage",
  "erp.push",
  "system.update",
];

export interface TwoFactorSubject {
  role: Role | string;
  permissions: readonly string[];
}

/** Bu hesap ikinci adımı kurmak zorunda mı? */
export function requiresTwoFactor(subject: TwoFactorSubject): boolean {
  if (TWO_FACTOR_REQUIRED_ROLES.includes(subject.role as Role)) return true;
  return subject.permissions.some((p) =>
    TWO_FACTOR_REQUIRED_PERMISSIONS.includes(p as Permission),
  );
}

/** Zorunluluğun sebebini kullanıcıya söyleyebilmek için. */
export function twoFactorRequirementReason(
  subject: TwoFactorSubject,
): string | null {
  if (TWO_FACTOR_REQUIRED_ROLES.includes(subject.role as Role)) {
    return "Rolünüz yönetici yetkisi taşıdığı için";
  }
  const hit = subject.permissions.find((p) =>
    TWO_FACTOR_REQUIRED_PERMISSIONS.includes(p as Permission),
  );
  return hit ? `"${hit}" yetkiniz olduğu için` : null;
}

// ─────────────────────────────────────────────
// yedek kodlar
// ─────────────────────────────────────────────

export const BACKUP_CODE_COUNT = 10;

/**
 * Yedek kod üret: 10 haneli, ortadan tireli (`A1B2C-3D4E5`).
 *
 * Alfabede `0/O` ve `1/I/L` yok — kâğıda yazılıp tekrar okunacak bir değerde
 * karışan karakterler destek çağrısı üretir. Kalan 30 karakter × 10 hane
 * ≈ 49 bit; tahmin edilemez.
 */
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateBackupCode(): string {
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (const b of bytes) out += BACKUP_ALPHABET[b % BACKUP_ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/** Karşılaştırma için normalize: tire ve boşluk atılır, büyük harfe çevrilir. */
function normalizeBackupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashBackupCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeBackupCode(code))
    .digest("hex");
}

function generateBackupCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  return { plain, hashes: plain.map(hashBackupCode) };
}

// ─────────────────────────────────────────────
// durum
// ─────────────────────────────────────────────

export interface TwoFactorStatus {
  enabled: boolean;
  /** Kurulum başlamış ama doğrulanmamış. */
  pending: boolean;
  enabledAt: Date | null;
  remainingBackupCodes: number;
  /** Bu hesap için zorunlu mu. */
  required: boolean;
  requirementReason: string | null;
  /** Şifreleme anahtarı kurulu mu — kurulamıyorsa ekran bunu söylemeli. */
  ready: boolean;
}

export async function twoFactorStatus(
  userId: string,
): Promise<TwoFactorStatus | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      permissions: true,
      totpSecret: true,
      totpEnabledAt: true,
      totpBackupCodes: true,
    },
  });
  if (!user) return null;

  const subject = { role: user.role, permissions: user.permissions };
  return {
    enabled: Boolean(user.totpEnabledAt),
    pending: Boolean(user.totpSecret) && !user.totpEnabledAt,
    enabledAt: user.totpEnabledAt,
    remainingBackupCodes: user.totpBackupCodes.length,
    required: requiresTwoFactor(subject),
    requirementReason: twoFactorRequirementReason(subject),
    ready: secretBoxReady(),
  };
}

// ─────────────────────────────────────────────
// kurulum
// ─────────────────────────────────────────────

export class TwoFactorError extends Error {
  constructor(
    message: string,
    readonly code:
      | "HESAP_YOK"
      | "ZATEN_ACIK"
      | "KURULUM_YOK"
      | "KOD_HATALI"
      | "KAPALI"
      | "ZORUNLU",
  ) {
    super(message);
    this.name = "TwoFactorError";
  }
}

export interface EnrollmentStart {
  /** QR okutulamazsa elle girilecek anahtar (4'erli gruplanmış). */
  manualKey: string;
  /** Authenticator uygulamasının okuduğu adres — QR bundan üretilir. */
  otpauthUri: string;
  /**
   * Okutulacak QR, hazır SVG olarak.
   *
   * Sunucuda çiziliyor: hazır bir QR *servisine* adres göndermek, hesabın TOTP
   * anahtarını üçüncü bir tarafa teslim etmek olurdu. Çizim `qr.ts`'te, dışarı
   * hiçbir istek çıkmıyor.
   */
  qrSvg: string;
  /** Authenticator listesinde görünecek ad (kiracının ticari adı). */
  issuer: string;
}

/**
 * Authenticator uygulamasında hesabın yanında görünecek ad.
 *
 * Kiracı yapılandırmasından geliyor: kullanıcının telefonunda üç ayrı
 * kurulumun kaydı yan yana durabilir ve hepsi "b2b" yazsaydı hangisinin hangi
 * firma olduğu anlaşılmazdı. Yapılandırma okunamıyorsa kurulum durmaz —
 * ikinci adımı bir yapılandırma eksiğine bağlamak, güvenliği kolayca
 * ertelenebilir bir şeye çevirir.
 */
async function defaultIssuer(): Promise<string> {
  try {
    const tenant = await loadTenant();
    return tenant.seller.tradeName ?? tenant.seller.legalName;
  } catch {
    return "b2b";
  }
}

/**
 * Kurulumu başlat: yeni anahtar üret, **şifreli** olarak sakla ama açma.
 *
 * Anahtar bu adımda veritabanına yazılır çünkü doğrulama ayrı bir istekte
 * gelecek; ara durumu istemcide taşımak, doğrulanmamış bir anahtarın istemci
 * tarafından değiştirilebilmesi demek olurdu. `totpEnabledAt` boş kaldığı için
 * bu haldeki hesap girişte ikinci adıma tabi değildir.
 *
 * Tekrar çağrılırsa yeni anahtar üretir — kullanıcı QR'ı okutamayıp baştan
 * başladığında beklenen davranış bu.
 */
export async function beginTwoFactorEnrollment(
  userId: string,
  issuerOverride?: string,
): Promise<EnrollmentStart> {
  const issuer = issuerOverride ?? (await defaultIssuer());
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, totpEnabledAt: true },
  });
  if (!user) throw new TwoFactorError("Hesap bulunamadı", "HESAP_YOK");
  if (user.totpEnabledAt) {
    throw new TwoFactorError(
      "İki adımlı doğrulama zaten açık. Yeniden kurmak için önce kapatın.",
      "ZATEN_ACIK",
    );
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: sealSecret(secret), totpLastStep: null },
  });

  const uri = otpauthUri({ secret, account: user.email, issuer });
  return {
    manualKey: formatSecretForDisplay(secret),
    otpauthUri: uri,
    qrSvg: qrSvg(uri, { scale: 5 }),
    issuer,
  };
}

export interface EnrollmentResult {
  /** Bir kez gösterilir, bir daha okunamaz. */
  backupCodes: string[];
}

/**
 * Kurulumu doğrula ve aç.
 *
 * Kod tutmadan **asla açılmaz**: doğrulamadan açmak, QR'ı yanlış okutmuş bir
 * kullanıcıyı kendi hesabından kalıcı olarak kilitler.
 */
export async function confirmTwoFactorEnrollment(
  userId: string,
  code: string,
  meta: RequestMeta = {},
): Promise<EnrollmentResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      totpSecret: true,
      totpEnabledAt: true,
    },
  });
  if (!user) throw new TwoFactorError("Hesap bulunamadı", "HESAP_YOK");
  if (user.totpEnabledAt) {
    throw new TwoFactorError("İki adımlı doğrulama zaten açık.", "ZATEN_ACIK");
  }
  if (!user.totpSecret) {
    throw new TwoFactorError(
      "Önce kurulumu başlatın (QR kodu alın).",
      "KURULUM_YOK",
    );
  }

  const secret = openSecret(user.totpSecret);
  // Kurulumda `lastUsedStep` yok: bu anahtarla henüz hiçbir kod harcanmadı.
  const hit = verifyTotp(secret, code);
  if (!hit) {
    await recordAudit({
      actor: { id: userId, email: user.email, role: user.role as Role },
      action: "TWO_FACTOR_FAILED",
      summary: "Kurulum doğrulamasında hatalı kod",
      entity: "User",
      entityId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { channel: meta.channel ?? "web", stage: "enrollment" },
    });
    throw new TwoFactorError(
      "Kod doğrulanamadı. Uygulamadaki güncel kodu girin ve telefonunuzun saatinin doğru olduğundan emin olun.",
      "KOD_HATALI",
    );
  }

  const { plain, hashes } = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpEnabledAt: new Date(),
      totpLastStep: hit.step,
      totpBackupCodes: hashes,
      // Açılış hesabın savunmasını değiştirir → o ana kadarki tüm oturumlar
      // ölür. Kullanıcı yeniden girerken ikinci adımı bir kez daha görür,
      // yani kurulumun gerçekten çalıştığını hemen anlar.
      tokenVersion: { increment: 1 },
    },
  });
  evictPrincipal(userId);

  await recordAudit({
    actor: { id: userId, email: user.email, role: user.role as Role },
    action: "TWO_FACTOR_ENABLED",
    summary: "İki adımlı doğrulama açıldı",
    entity: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { channel: meta.channel ?? "web", backupCodes: plain.length },
  });

  return { backupCodes: plain };
}

/**
 * Kapat.
 *
 * Geçerli bir kod (ya da yedek kod) ister: oturumu ele geçiren biri ikinci
 * adımı tek tıkla kaldırabilseydi, koruma yalnızca giriş anında var olurdu.
 *
 * Zorunlu kapsamdaki hesap kapatamaz — kapatabilseydi zorunluluk bir öneriye
 * dönerdi. Telefon kaybında yol yedek kod, o da yoksa yönetici sıfırlaması.
 */
export async function disableTwoFactor(
  userId: string,
  code: string,
  meta: RequestMeta = {},
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      permissions: true,
      totpSecret: true,
      totpEnabledAt: true,
      totpLastStep: true,
      totpBackupCodes: true,
    },
  });
  if (!user) throw new TwoFactorError("Hesap bulunamadı", "HESAP_YOK");
  if (!user.totpEnabledAt || !user.totpSecret) {
    throw new TwoFactorError("İki adımlı doğrulama zaten kapalı.", "KAPALI");
  }
  if (requiresTwoFactor({ role: user.role, permissions: user.permissions })) {
    throw new TwoFactorError(
      "Yetkileriniz iki adımlı doğrulamayı zorunlu kılıyor; kapatılamaz. " +
        "Cihazınızı değiştirecekseniz yöneticinize sıfırlatın.",
      "ZORUNLU",
    );
  }

  const check = await verifySecondFactor(
    {
      totpSecret: user.totpSecret,
      totpLastStep: user.totpLastStep,
      totpBackupCodes: user.totpBackupCodes,
    },
    code,
  );
  if (!check.ok) {
    throw new TwoFactorError("Kod doğrulanamadı.", "KOD_HATALI");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      totpLastStep: null,
      totpBackupCodes: [],
      tokenVersion: { increment: 1 },
    },
  });
  evictPrincipal(userId);

  await recordAudit({
    actor: { id: userId, email: user.email, role: user.role as Role },
    action: "TWO_FACTOR_DISABLED",
    summary: "İki adımlı doğrulama kapatıldı",
    entity: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { channel: meta.channel ?? "web", via: check.via },
  });
}

/**
 * Yönetici sıfırlaması — telefonunu ve yedek kodlarını kaybeden kullanıcı için.
 *
 * Hesabı **2FA'sız bırakmaz**: kayıt silinir, kullanıcı bir sonraki girişinde
 * zorunlu kapsamdaysa yeniden kurulum ekranına düşer. Yani sıfırlama bir kaçış
 * kapısı değil, yeni bir cihaz kaydetme izni.
 *
 * `users.manage` yetkisini doğrulamak rota katmanının işi, ama **kapsam
 * burada**: hedefin çağıranın görebileceği bir hesap olduğu `getUser` ile
 * doğrulanıyor. Bunu da rotaya bırakmak, ikinci adımı kaldırma yetkisini
 * "sadece o rota hatırlarsa" firmayla sınırlı kılardı — bir firma yöneticisi
 * başka firmanın yöneticisinin 2FA'sını düşürebilirdi.
 */
export async function resetTwoFactorFor(
  targetUserId: string,
  ctx: UserAdminContext,
): Promise<void> {
  // Kapsam kapısı: hedef görünmüyorsa USER_NOT_FOUND / FORBIDDEN atar.
  await getUser(targetUserId, ctx);

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { email: true, totpEnabledAt: true, totpSecret: true },
  });
  if (!target) throw new TwoFactorError("Hesap bulunamadı", "HESAP_YOK");
  if (!target.totpSecret && !target.totpEnabledAt) {
    throw new TwoFactorError("Bu hesapta iki adımlı doğrulama yok.", "KAPALI");
  }

  const meta = ctx.meta ?? {};
  const actor = { id: ctx.userId, email: ctx.email, role: ctx.role };

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      totpLastStep: null,
      totpBackupCodes: [],
      tokenVersion: { increment: 1 },
    },
  });
  evictPrincipal(targetUserId);

  await recordAudit({
    actor,
    action: "TWO_FACTOR_RESET",
    summary: `${target.email} hesabının iki adımlı doğrulaması sıfırlandı`,
    entity: "User",
    entityId: targetUserId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { channel: meta.channel ?? "web", targetEmail: target.email },
  });
}

/** Yedek kodları yenile — biten listeyi tazelemek için. */
export async function regenerateBackupCodes(
  userId: string,
  code: string,
  meta: RequestMeta = {},
): Promise<EnrollmentResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      totpSecret: true,
      totpEnabledAt: true,
      totpLastStep: true,
      totpBackupCodes: true,
    },
  });
  if (!user) throw new TwoFactorError("Hesap bulunamadı", "HESAP_YOK");
  if (!user.totpEnabledAt || !user.totpSecret) {
    throw new TwoFactorError("İki adımlı doğrulama kapalı.", "KAPALI");
  }

  const check = await verifySecondFactor(
    {
      totpSecret: user.totpSecret,
      totpLastStep: user.totpLastStep,
      totpBackupCodes: user.totpBackupCodes,
    },
    code,
  );
  if (!check.ok) throw new TwoFactorError("Kod doğrulanamadı.", "KOD_HATALI");

  const { plain, hashes } = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpBackupCodes: hashes,
      ...(check.step != null ? { totpLastStep: check.step } : {}),
    },
  });

  await recordAudit({
    actor: { id: userId, email: user.email, role: user.role as Role },
    action: "TWO_FACTOR_ENABLED",
    summary: "Yedek kodlar yenilendi",
    entity: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { channel: meta.channel ?? "web", regenerated: true },
  });

  return { backupCodes: plain };
}

// ─────────────────────────────────────────────
// giriş sırasında doğrulama
// ─────────────────────────────────────────────

export interface SecondFactorRow {
  totpSecret: string | null;
  totpLastStep: number | null;
  totpBackupCodes: string[];
}

export type SecondFactorCheck =
  | { ok: true; via: "totp"; step: number }
  | { ok: true; via: "backup"; step: null; remainingBackupCodes: number }
  | { ok: false; via: null; step: null };

/**
 * Kodu doğrula — önce TOTP, tutmazsa yedek kod.
 *
 * **Yan etkisi var:** tutan yedek kod listeden düşülür (tek kullanımlık).
 * Kabul edilen TOTP adımının saklanması çağıranın işi — girişte bu, başarı
 * yolundaki tek `update` ile birlikte yazılıyor.
 */
export async function verifySecondFactor(
  row: SecondFactorRow,
  code: string,
  userId?: string,
): Promise<SecondFactorCheck> {
  if (!row.totpSecret) return { ok: false, via: null, step: null };

  const secret = openSecret(row.totpSecret);
  const hit = verifyTotp(secret, code, { lastUsedStep: row.totpLastStep });
  if (hit) return { ok: true, via: "totp", step: hit.step };

  // Yedek kod. Karşılaştırma özet üzerinden; girilen değer önce normalize
  // edilir ki kullanıcı tireyi atlasa da kod tutsun.
  const digest = hashBackupCode(code);
  const index = row.totpBackupCodes.indexOf(digest);
  if (index < 0) return { ok: false, via: null, step: null };

  const remaining = row.totpBackupCodes.filter((_, i) => i !== index);
  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { totpBackupCodes: remaining },
    });
  }
  return {
    ok: true,
    via: "backup",
    step: null,
    remainingBackupCodes: remaining.length,
  };
}
