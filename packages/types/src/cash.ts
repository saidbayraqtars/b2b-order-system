import { z } from "zod";
import {
  CashAccountKindEnum,
  CashDirectionEnum,
  CashMovementSourceEnum,
  PaymentMethodEnum,
} from "./enums";

// Kasa & banka defteri: hesap tanımları, elle giriş/çıkış, aktarım, gün sonu.
// Who may call these is decided in the route layer; these describe shape only.

const money = z.coerce
  .number()
  .min(0.01, "Tutar sıfırdan büyük olmalı")
  .max(99_999_999.99)
  .multipleOf(0.01, "En fazla iki ondalık basamak");

/** ISO date (YYYY-MM-DD) or a full timestamp; the service normalises to a day. */
const dateString = z.string().trim().min(8).max(40);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

export const createCashAccountSchema = z.object({
  name: z.string().trim().min(1, "Hesap adı gerekli").max(120),
  kind: CashAccountKindEnum.default("CASH"),
  currency: z.string().trim().length(3).toUpperCase().default("TRY"),
  bankName: optionalText(120),
  iban: optionalText(40),
  /**
   * Devir bakiyesi — what was already in the drawer when the system arrived.
   * Set once, at creation: it is summed straight into the balance and has no
   * entry of its own, so editing it later would move money with no trace.
   */
  openingBalance: z.coerce.number().min(0).max(99_999_999.99).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});
export type CreateCashAccountInput = z.infer<typeof createCashAccountSchema>;

export const updateCashAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    kind: CashAccountKindEnum.optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    bankName: optionalText(120).nullable(),
    iban: optionalText(40).nullable(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateCashAccountInput = z.infer<typeof updateCashAccountSchema>;

/** Null clears the binding, sending that method back to the default account. */
export const setMethodBindingSchema = z.object({
  method: PaymentMethodEnum,
  accountId: z.string().cuid().nullable(),
});
export type SetMethodBindingInput = z.infer<typeof setMethodBindingSchema>;

export const manualMovementSchema = z.object({
  accountId: z.string().cuid(),
  direction: CashDirectionEnum,
  amount: money,
  /** Required: an unexplained entry in a till is indistinguishable from a loss. */
  description: z.string().trim().min(1, "Açıklama gerekli").max(300),
  occurredAt: dateString.optional(),
});
export type ManualMovementInput = z.infer<typeof manualMovementSchema>;

export const cashTransferSchema = z
  .object({
    fromAccountId: z.string().cuid(),
    toAccountId: z.string().cuid(),
    amount: money,
    description: optionalText(300),
    occurredAt: dateString.optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, "Aynı hesaba aktarım yapılamaz");
export type CashTransferInput = z.infer<typeof cashTransferSchema>;

export const reverseCashMovementSchema = z.object({
  reason: z.string().trim().min(1, "İptal gerekçesi gerekli").max(300),
});
export type ReverseCashMovementInput = z.infer<typeof reverseCashMovementSchema>;

export const cashMovementFilterSchema = z.object({
  accountId: z.string().cuid().optional(),
  source: CashMovementSourceEnum.optional(),
  direction: CashDirectionEnum.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type CashMovementFilter = z.infer<typeof cashMovementFilterSchema>;
