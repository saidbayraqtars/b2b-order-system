import { z } from "zod";
import { RoleEnum } from "./enums";
import { passwordSchema } from "./admin";

// Self-service account management + the audit trail's query shape.
// Anything an administrator does to *another* account lives in ./admin.ts;
// this file is only about what a user may do to their own.

// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────

/**
 * A user may edit their own name and phone — and nothing else. E-mail is the
 * login identifier and role/company decide what they can see, so both stay
 * with the administrator.
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Ad gerekli").max(120),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Changing your own password requires proving you know the current one — an
 * unattended open session must not be enough to take an account over.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mevcut şifre gerekli"),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Yeni şifre mevcut şifreyle aynı olamaz",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ─────────────────────────────────────────────
// AUDIT TRAIL
// ─────────────────────────────────────────────

/** Must match the AuditAction enum in the Prisma schema. */
export const AuditActionEnum = z.enum([
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGIN_LOCKED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "NOTIFICATION_SENT",
  "NOTIFICATION_FAILED",
  "PROFILE_UPDATED",
  "SESSION_REVOKED",
  "ACCESS_DENIED",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_ROLE_CHANGED",
  "USER_PERMISSIONS_CHANGED",
  "USER_DEACTIVATED",
  "USER_ACTIVATED",
  "USER_DELETED",
  "COMPANY_CREATED",
  "COMPANY_UPDATED",
  "COMPANY_DELETED",
  "MEDIA_UPLOADED",
  "AUDIT_PURGED",
  "AUDIT_EXPORTED",
]);
export type AuditAction = z.infer<typeof AuditActionEnum>;

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: "Giriş",
  LOGIN_FAILED: "Başarısız giriş",
  LOGIN_LOCKED: "Hesap kilitlendi",
  LOGOUT: "Çıkış",
  PASSWORD_CHANGED: "Şifre değiştirildi",
  PASSWORD_RESET: "Şifre sıfırlandı (yönetici)",
  PASSWORD_RESET_REQUESTED: "Şifre sıfırlama istendi",
  PASSWORD_RESET_COMPLETED: "Şifre bağlantı ile sıfırlandı",
  NOTIFICATION_SENT: "Bildirim gönderildi",
  NOTIFICATION_FAILED: "Bildirim gönderilemedi",
  PROFILE_UPDATED: "Profil güncellendi",
  SESSION_REVOKED: "Oturum geçersiz kılındı",
  ACCESS_DENIED: "Yetkisiz erişim denemesi",
  USER_CREATED: "Kullanıcı oluşturuldu",
  USER_UPDATED: "Kullanıcı güncellendi",
  USER_ROLE_CHANGED: "Rol değiştirildi",
  USER_PERMISSIONS_CHANGED: "Yetkiler değiştirildi",
  USER_DEACTIVATED: "Kullanıcı pasife alındı",
  USER_ACTIVATED: "Kullanıcı aktifleştirildi",
  USER_DELETED: "Kullanıcı silindi",
  COMPANY_CREATED: "Firma oluşturuldu",
  COMPANY_UPDATED: "Firma güncellendi",
  COMPANY_DELETED: "Firma silindi",
  MEDIA_UPLOADED: "Görsel yüklendi",
  AUDIT_PURGED: "Denetim kaydı temizlendi",
  AUDIT_EXPORTED: "Denetim kaydı dışa aktarıldı",
};

/** Actions worth surfacing as "security events" by default in the viewer. */
export const SECURITY_ACTIONS: readonly AuditAction[] = [
  "LOGIN_FAILED",
  "LOGIN_LOCKED",
  "SESSION_REVOKED",
  "ACCESS_DENIED",
  "USER_ROLE_CHANGED",
  // Rol değişikliği kadar önemli: yetki artık asıl kaynak, bir izin sessizce
  // eklenirse güvenlik ekranında görünmemesi kör nokta olurdu.
  "USER_PERMISSIONS_CHANGED",
  "PASSWORD_RESET",
  "PASSWORD_RESET_COMPLETED",
  "USER_DELETED",
  "AUDIT_PURGED",
  "AUDIT_EXPORTED",
];

const isoDate = z
  .string()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), "Geçersiz tarih");

export const auditQuerySchema = z
  .object({
    action: AuditActionEnum.optional(),
    actorId: z.string().cuid().optional(),
    entity: z.string().max(40).optional(),
    entityId: z.string().max(60).optional(),
    /** Free-text over actor e-mail and summary. */
    search: z.string().trim().max(120).optional(),
    /** Only the actions in SECURITY_ACTIONS. */
    securityOnly: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    cursor: z.string().cuid().optional(),
  })
  .refine(
    (v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to),
    "Başlangıç tarihi bitişten sonra olamaz",
  );
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  actorEmail: z.string(),
  actorRole: RoleEnum.nullable(),
  action: AuditActionEnum,
  entity: z.string().nullable(),
  entityId: z.string().nullable(),
  summary: z.string(),
  ip: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

// ── "Şifremi unuttum" ──

export const forgotPasswordSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin").max(200),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  password: z
    .string()
    .min(8, "Şifre en az 8 karakter olmalı")
    .max(100)
    .regex(/[A-Za-z]/, "Şifre en az bir harf içermeli")
    .regex(/[0-9]/, "Şifre en az bir rakam içermeli"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
