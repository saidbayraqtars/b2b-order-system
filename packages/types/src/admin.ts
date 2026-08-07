import { z } from "zod";
import { PaymentMethodEnum, RoleEnum, VolumeDiscountModeEnum } from "./enums";
import { permissionListSchema } from "./permission";

// Company, address, user and customer-group administration.
// Role rules (who may create what) live in the service layer — these schemas
// only describe shape and field-level validity.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/** TR: 10-digit vergi numarası or 11-digit TC kimlik numarası. */
const taxNumber = z
  .string()
  .trim()
  .regex(/^\d{10,11}$/, "Vergi/TC numarası 10 veya 11 hane olmalı")
  .optional()
  .or(z.literal("").transform(() => undefined));

const money = z.coerce.number().min(0, "Negatif olamaz").max(99_999_999);

/**
 * Which settlement methods a customer may pick. **Empty means no restriction**,
 * not "nothing allowed" — restricting is a deliberate act, so a company nobody
 * has configured keeps every method. Same convention as `paymentTermIds` below
 * and as Announcement.customerGroupIds.
 */
const allowedPaymentMethods = z.array(PaymentMethodEnum).max(10);

/** Vade options offered to a customer. Empty = no menu; the default term applies. */
const paymentTermIds = z.array(z.string().cuid()).max(50);

// ─────────────────────────────────────────────
// COMPANY
// ─────────────────────────────────────────────

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Firma adı gerekli").max(200),
  taxNumber: taxNumber,
  taxOffice: optionalText(120),
  email: z.string().trim().email("Geçersiz e-posta").optional().or(z.literal("").transform(() => undefined)),
  phone: optionalText(40),
  creditLimit: money.default(0),
  /** Default vade: what an order gets when no term is picked from the menu. */
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(0),
  currency: z.string().trim().length(3).default("TRY"),
  requiresOrderApproval: z.boolean().default(false),
  isActive: z.boolean().default(true),
  customerGroupId: z.string().cuid().optional().or(z.literal("").transform(() => undefined)),
  salesRepId: z.string().cuid().optional().or(z.literal("").transform(() => undefined)),
  allowedPaymentMethods: allowedPaymentMethods.default([]),
  paymentTermIds: paymentTermIds.default([]),
  /** AUTO earns the hacim tier from turnover; MANUAL pins `volumeTierId`. */
  volumeDiscountMode: VolumeDiscountModeEnum.default("AUTO"),
  volumeTierId: z.string().cuid().optional().or(z.literal("").transform(() => undefined)),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    taxNumber: taxNumber.nullable(),
    taxOffice: optionalText(120).nullable(),
    email: z
      .string()
      .trim()
      .email("Geçersiz e-posta")
      .optional()
      .or(z.literal("").transform(() => undefined))
      .nullable(),
    phone: optionalText(40).nullable(),
    creditLimit: money.optional(),
    paymentTermDays: z.coerce.number().int().min(0).max(365).optional(),
    currency: z.string().trim().length(3).optional(),
    requiresOrderApproval: z.boolean().optional(),
    isActive: z.boolean().optional(),
    customerGroupId: z.string().cuid().nullable().optional(),
    salesRepId: z.string().cuid().nullable().optional(),
    allowedPaymentMethods: allowedPaymentMethods.optional(),
    paymentTermIds: paymentTermIds.optional(),
    volumeDiscountMode: VolumeDiscountModeEnum.optional(),
    /** Nullable: clearing the pin under MANUAL is how the ladder is turned off. */
    volumeTierId: z.string().cuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

// ─────────────────────────────────────────────
// PAYMENT TERM (vade tanımı)
// ─────────────────────────────────────────────

export const createPaymentTermSchema = z.object({
  name: z.string().trim().min(1, "Vade adı gerekli").max(80),
  /** Days added to the invoice date. 0 = peşin. */
  days: z.coerce.number().int().min(0).max(365),
  isActive: z.boolean().default(true),
  /** Menu order. Defaults to `days` in the service, so terms sort naturally. */
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});
export type CreatePaymentTermInput = z.infer<typeof createPaymentTermSchema>;

export const updatePaymentTermSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    days: z.coerce.number().int().min(0).max(365).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdatePaymentTermInput = z.infer<typeof updatePaymentTermSchema>;

// ─────────────────────────────────────────────
// VOLUME TIER (hacim iskontosu basamağı)
// ─────────────────────────────────────────────

/**
 * Capped at 90 so a mistyped rate cannot hand the goods away, and at two
 * decimals because that is what the column stores — a 5.005 typed here would
 * round on write and quietly price differently from what the admin approved.
 */
const discountPercent = z.coerce
  .number()
  .min(0.01, "İskonto oranı sıfırdan büyük olmalı")
  .max(90, "İskonto oranı en fazla %90 olabilir")
  .multipleOf(0.01, "En fazla iki ondalık basamak");

/** Rolling window the turnover is measured over. One month to five years. */
const windowMonths = z.coerce.number().int().min(1).max(60);

export const createVolumeTierSchema = z.object({
  name: z.string().trim().min(1, "Basamak adı gerekli").max(80),
  minRevenue: money,
  windowMonths: windowMonths.default(12),
  discountPercent,
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});
export type CreateVolumeTierInput = z.infer<typeof createVolumeTierSchema>;

export const updateVolumeTierSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    minRevenue: money.optional(),
    windowMonths: windowMonths.optional(),
    discountPercent: discountPercent.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateVolumeTierInput = z.infer<typeof updateVolumeTierSchema>;

// ─────────────────────────────────────────────
// ADDRESS
// ─────────────────────────────────────────────

export const createAddressSchema = z.object({
  label: z.string().trim().min(1, "Adres etiketi gerekli").max(80),
  line1: z.string().trim().min(1, "Adres gerekli").max(300),
  line2: optionalText(300),
  city: z.string().trim().min(1, "Şehir gerekli").max(80),
  district: optionalText(80),
  postalCode: optionalText(20),
  isDefault: z.boolean().default(false),
  /**
   * Kapının koordinatı. Boş bırakılabilir — koordinatı olmayan adres ziyaret
   * listesinde kalır, yalnızca haritada pin düşmez ve yol tarifi yazılı adresle
   * açılır.
   */
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    line1: z.string().trim().min(1).max(300).optional(),
    line2: optionalText(300).nullable(),
    city: z.string().trim().min(1).max(80).optional(),
    district: optionalText(80).nullable(),
    postalCode: optionalText(20).nullable(),
    isDefault: z.boolean().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

// ─────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────

/** Long enough to matter, mixed enough to rule out "12345678" and "password". */
export const passwordSchema = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalı")
  .max(128)
  .regex(/[A-Za-zÇĞİÖŞÜçğıöşü]/, "Şifre en az bir harf içermeli")
  .regex(/\d/, "Şifre en az bir rakam içermeli");

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Geçersiz e-posta").max(200),
  name: z.string().trim().min(1, "Ad gerekli").max(120),
  phone: optionalText(40),
  role: RoleEnum,
  password: passwordSchema,
  companyId: z.string().cuid().optional().or(z.literal("").transform(() => undefined)),
  isActive: z.boolean().default(true),
  /**
   * Tek tek seçilen yetkiler. Yokluğu "yetki verme" değil, "rolün şablonunu
   * kullan" demek (bkz. createUser) — yoksa bu alanı bilmeyen eski bir istemci
   * yetkisiz, işe yaramaz hesaplar açardı.
   */
  permissions: permissionListSchema.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Geçersiz e-posta").max(200).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    phone: optionalText(40).nullable(),
    role: RoleEnum.optional(),
    companyId: z.string().cuid().nullable().optional(),
    isActive: z.boolean().optional(),
    /** Verilirse kümenin tamamı bununla değiştirilir — kısmi ekleme/çıkarma yok. */
    permissions: permissionListSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Password reset is its own endpoint so it never rides along with a profile edit. */
export const setPasswordSchema = z.object({ password: passwordSchema });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

// ─────────────────────────────────────────────
// CUSTOMER GROUP
// ─────────────────────────────────────────────

export const createCustomerGroupSchema = z.object({
  name: z.string().trim().min(1, "Grup adı gerekli").max(120),
  description: optionalText(300),
});
export type CreateCustomerGroupInput = z.infer<typeof createCustomerGroupSchema>;

export const updateCustomerGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: optionalText(300).nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateCustomerGroupInput = z.infer<typeof updateCustomerGroupSchema>;

export const ROLE_LABELS: Record<z.infer<typeof RoleEnum>, string> = {
  SUPER_ADMIN: "Süper admin",
  COMPANY_ADMIN: "Firma yöneticisi",
  COMPANY_STAFF: "Firma personeli",
  SALES_REP: "Plasiyer",
  COURIER: "Kurye",
};
