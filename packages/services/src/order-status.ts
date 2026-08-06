import type { OrderStatus } from "@repo/types";

// Which orders count as "this customer actually traded with us".
//
// Its own file because two unrelated features ask the same question — the
// promotion engine's FIRST_ORDER condition and the hacim (turnover) ladder —
// and they must never answer it differently: a customer that a campaign treats
// as a returning buyer cannot be a customer whose turnover is zero. Neither
// order-lifecycle.ts nor promotion.ts could hold it without an import cycle.

/**
 * A draft was never placed, and a cancelled or rejected order was un-placed.
 * The pending states *are* counted: the customer committed, and an order
 * waiting on an approval it will get should not make the ladder flicker.
 */
export const UNTRADED_ORDER_STATUSES: readonly OrderStatus[] = [
  "DRAFT",
  "CANCELLED",
  "REJECTED",
];
