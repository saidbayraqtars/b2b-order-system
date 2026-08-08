import { z } from "zod";
import { entityIdSchema } from "./id";
import { cartItemInputSchema } from "./order";

// The server cart holds intent, not money: a variant and how many. Prices,
// campaigns and VAT are resolved when the cart is read or quoted, never stored
// on the row — a cart that remembered last week's price would be a lie the
// moment a price list changed.
//
// The line shape is the order's, on purpose: a cart is the draft of an order,
// and letting the two drift would let a cart hold something no order could.

/** Replace the whole cart. An empty list is valid — that is "clear". */
export const setCartSchema = z.object({
  companyId: z.string().cuid(),
  items: z.array(cartItemInputSchema).max(200),
});
export type SetCartInput = z.infer<typeof setCartSchema>;

/** Add to (or overwrite) one line without sending the rest. */
export const upsertCartItemSchema = z.object({
  companyId: z.string().cuid(),
  // cuid() değil — bkz. id.ts: içe aktarılan kataloğun kimlikleri o biçimde
  // değil ve satır sepete hiç girmiyordu.
  variantId: entityIdSchema,
  quantity: z.number().int().min(0).max(1_000_000),
  /** true → add to what is already there; false/absent → set it outright. */
  increment: z.boolean().optional(),
});
export type UpsertCartItemInput = z.infer<typeof upsertCartItemSchema>;

export const cartQuerySchema = z.object({
  companyId: z.string().cuid().optional(),
});
export type CartQueryInput = z.infer<typeof cartQuerySchema>;
