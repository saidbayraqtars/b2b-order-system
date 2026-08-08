import { z } from "zod";
import { PaymentMethodEnum } from "./enums";
import { entityIdSchema } from "./id";

// Shape of a campaign. These schemas check STRUCTURE only: that a rule has a
// type and a params object, that a promotion has a name, and so on.
//
// Whether a rule type exists, and whether its params are the right ones, is
// decided by the promotion rule registry in @repo/services — the registry is
// the security boundary and it runs on every write AND every evaluation. Same
// split as the report builder (see report-builder.ts).

/** One condition or action: a registry key plus its parameters. */
export const promotionRuleSchema = z.object({
  type: z.string().min(1).max(60),
  params: z.record(z.unknown()).default({}),
});
export type PromotionRuleInput = z.infer<typeof promotionRuleSchema>;

/** Coupon codes are matched case-insensitively; the server stores them upper-case. */
export const couponCodeSchema = z
  .string()
  .trim()
  .min(3, "Kupon kodu en az 3 karakter")
  .max(40)
  .regex(/^[A-Za-z0-9._-]+$/, "Kupon kodu harf, rakam, nokta, tire içerebilir");

const promotionBodySchema = z.object({
  name: z.string().min(1, "Kampanya adı gerekli").max(120),
  description: z.string().max(500).optional(),
  /** null / omitted = automatic promotion (no code needed). */
  code: couponCodeSchema.nullable().optional(),
  enabled: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  stopFurther: z.boolean().optional(),
  /** How the conditions are joined: every one (AND) or at least one (OR). */
  conditionMode: z.enum(["ALL", "ANY"]).optional(),
  usageLimit: z.number().int().positive().max(1_000_000).nullable().optional(),
  perCompanyLimit: z.number().int().positive().max(10_000).nullable().optional(),
  conditions: z.array(promotionRuleSchema).max(10).default([]),
  actions: z.array(promotionRuleSchema).max(5),
});

export const createPromotionSchema = promotionBodySchema
  .refine((v) => v.actions.length > 0, {
    message: "En az bir aksiyon seçin",
    path: ["actions"],
  })
  .refine(
    (v) => !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt),
    { message: "Bitiş tarihi başlangıçtan sonra olmalı", path: ["endsAt"] },
  );
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = promotionBodySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok")
  .refine((v) => v.actions === undefined || v.actions.length > 0, {
    message: "En az bir aksiyon seçin",
    path: ["actions"],
  })
  .refine(
    (v) => !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt),
    { message: "Bitiş tarihi başlangıçtan sonra olmalı", path: ["endsAt"] },
  );
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

/**
 * Price a cart without placing it: what the buyer sees before checkout.
 *
 * Settlement fields mirror `createOrderSchema` exactly, and that is not
 * cosmetic: both go through `buildQuote`, so a method or vade the preview
 * accepts must be one the order accepts. When this schema listed its own
 * narrower set of methods, a customer allowed to pay by cheque got a
 * validation error in the cart and a working order from the API.
 */
export const quoteOrderSchema = z.object({
  companyId: z.string().cuid(),
  paymentMethod: PaymentMethodEnum.default("OPEN_ACCOUNT"),
  /** Vade picked from the menu this customer was offered. */
  paymentTermId: z.string().cuid().optional(),
  /** Free-form vade in days; refused unless the caller is on the selling side. */
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  couponCode: couponCodeSchema.optional(),
  /** Freight, so a seller-side preview can show a shipping campaign working. */
  shippingFee: z.number().min(0).max(1_000_000).optional(),
  items: z
    .array(
      z.object({
        // cuid() değil — bkz. id.ts.
        variantId: entityIdSchema,
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Sepet boş olamaz"),
});
export type QuoteOrderInput = z.infer<typeof quoteOrderSchema>;

/**
 * What kind of input a rule parameter needs. The admin builder renders a control
 * per kind; the registry decides which kind each parameter is, so the UI never
 * has to know the rule catalogue by heart.
 */
export const RuleParamKindEnum = z.enum([
  "money",
  "percent",
  "quantity",
  "categoryIds",
  "productIds",
  "customerGroupIds",
  "companyIds",
  "paymentMethod",
  /** A single product variant — the gift a campaign hands out. */
  "variantId",
]);
export type RuleParamKind = z.infer<typeof RuleParamKindEnum>;

/** Registry metadata handed to the builder UI (GET /api/admin/promotions/rules). */
export interface RuleParamMeta {
  key: string;
  label: string;
  kind: RuleParamKind;
  required: boolean;
  hint?: string;
}

export interface RuleMeta {
  type: string;
  label: string;
  description: string;
  params: RuleParamMeta[];
}

export interface PromotionRuleCatalog {
  conditions: RuleMeta[];
  actions: RuleMeta[];
}
