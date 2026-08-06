import { z } from "zod";

// Who this installation *is* — the seller, not a customer.
//
// Every customer firm runs its own instance (its own server or hosting we rent
// for it), so this is one record per deployment, not a table. It lives in a
// file rather than the database on purpose: the folder is what gets handed
// over, edited by hand and pushed back during support. A database row could not
// be edited that way, and a copy in both places would drift.
//
// Nothing here is optional-by-accident. A waybill or an invoice with no seller
// on it is not a document, it is a piece of paper — so the required fields are
// exactly the ones a Turkish invoice header cannot legally lack.

/** VKN is 10 digits, TCKN 11 — a sole trader invoices under the latter. */
const taxNumber = z
  .string()
  .trim()
  .regex(/^\d{10,11}$/, "VKN 10, TCKN 11 hane olmalı");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/** TR IBAN: TR + 24 digits. Spaces are how people type it, so they are dropped. */
const iban = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^TR\d{24}$/, "Geçersiz TR IBAN"));

export const sellerAddressSchema = z.object({
  line1: z.string().trim().min(1, "Adres satırı gerekli").max(200),
  line2: optionalText(200),
  district: optionalText(80),
  city: z.string().trim().min(1, "İl gerekli").max(80),
  postalCode: optionalText(10),
  country: z.string().trim().min(1).max(80).default("Türkiye"),
});
export type SellerAddress = z.infer<typeof sellerAddressSchema>;

export const sellerSchema = z.object({
  /** Ticaret unvanı — what goes on the invoice, in full. */
  legalName: z.string().trim().min(1, "Ticaret unvanı gerekli").max(200),
  /** Marka adı, if the firm trades under a shorter name. Header display only. */
  tradeName: optionalText(120),
  taxOffice: z.string().trim().min(1, "Vergi dairesi gerekli").max(120),
  taxNumber,
  /** 16 hane. Required on documents for firms in the trade registry. */
  mersisNo: z
    .string()
    .trim()
    .regex(/^\d{16}$/, "MERSİS numarası 16 hane olmalı")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  tradeRegistryNo: optionalText(40),
  address: sellerAddressSchema,
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .email("Geçersiz e-posta")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  website: optionalText(200),
  /** Printed on the invoice so a customer paying by transfer has the number. */
  bankAccounts: z
    .array(z.object({ label: z.string().trim().min(1).max(80), iban }))
    .max(10)
    .default([]),
});
export type Seller = z.infer<typeof sellerSchema>;

/**
 * Paths are relative to the tenant folder and served through /api/branding,
 * never from public/ — public/ is a build-time directory, and the whole point
 * of the tenant folder is that it can be replaced without a rebuild.
 */
export const brandingSchema = z
  .object({
    logo: optionalText(200),
    favicon: optionalText(200),
  })
  .default({});
export type Branding = z.infer<typeof brandingSchema>;

export const tenantConfigSchema = z.object({
  /** Folder name and update target. Lowercase so it is safe in a path or a URL. */
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/, "Slug küçük harf, rakam ve tire olabilir"),
  seller: sellerSchema,
  branding: brandingSchema,
});
export type TenantConfig = z.infer<typeof tenantConfigSchema>;
