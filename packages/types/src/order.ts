import { z } from "zod";
import { PaymentMethodEnum } from "./enums";

export const cartItemInputSchema = z.object({
  variantId: z.string().cuid(),
  quantity: z.number().int().positive(),
});
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const createOrderSchema = z.object({
  companyId: z.string().cuid(),
  paymentMethod: PaymentMethodEnum.default("OPEN_ACCOUNT"),
  shippingAddressId: z.string().cuid().optional(),
  note: z.string().max(1000).optional(),
  items: z.array(cartItemInputSchema).min(1, "Sepet boş olamaz"),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const recordPaymentSchema = z.object({
  companyId: z.string().cuid(),
  amount: z.number().positive(),
  paymentMethod: PaymentMethodEnum,
  description: z.string().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const checkInSchema = z.object({
  companyId: z.string().cuid(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  note: z.string().max(500).optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;
