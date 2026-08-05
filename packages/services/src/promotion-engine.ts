import { ZERO, round2 } from "./money";
import type { Money } from "./money";
import type {
  CompiledAction,
  CompiledCondition,
  EngineContext,
  EngineLine,
} from "./promotion-registry";

/**
 * Applies campaigns to a priced cart.
 *
 * Deliberately pure — no Prisma, no clock, no request context — so the maths can
 * be reasoned about and unit-tested on its own. Loading promotions and writing
 * redemptions is promotion.ts's job; deciding *what* a rule means is
 * promotion-registry.ts's.
 *
 * Rules of the house:
 *  - Promotions run in `priority` order (lowest first) and each one sees what the
 *    previous ones left behind, so stacked campaigns compound rather than all
 *    biting the same original amount.
 *  - A line can never go below zero, nor can the freight, and a promotion that
 *    ends up granting nothing is not recorded as applied.
 *  - `stopFurther` ends the run after the promotion that carries it applies —
 *    that is how an exclusive campaign is expressed.
 *  - Conditions are joined by the promotion's own `conditionMode`: every one
 *    (the default) or at least one. A promotion with no conditions always holds.
 *
 * Gifts are the one thing the engine cannot finish on its own: it knows *what*
 * to give and *how many*, but pricing belongs to the catalogue. It reports the
 * grants and the quote turns them into fully-discounted lines.
 */

export type ConditionMode = "ALL" | "ANY";

export interface CompiledPromotion {
  id: string;
  name: string;
  /** null for automatic promotions. */
  code: string | null;
  priority: number;
  stopFurther: boolean;
  conditionMode: ConditionMode;
  conditions: CompiledCondition[];
  actions: CompiledAction[];
}

export interface AppliedPromotion {
  promotionId: string;
  name: string;
  code: string | null;
  /**
   * Everything this promotion gave the buyer, excl. VAT — line discounts plus
   * whatever it took off the freight. This is the figure the buyer is shown
   * ("Kampanya: X − 150"); the order splits it across its own columns, and the
   * value of any gift is added by the quote once it has priced it.
   */
  amount: Money;
}

/** A free item a promotion granted, waiting to be priced. */
export interface GrantedGift {
  promotionId: string;
  variantId: string;
  quantity: number;
}

export interface PromotionResult {
  /** Discount per line key; lines that got nothing are absent. */
  perLine: Map<string, Money>;
  /**
   * How much came off the freight in total. Kept apart from `total` on purpose:
   * the freight is discounted at source, so counting it in the goods discount
   * as well would take it off the order twice.
   */
  shippingDiscount: Money;
  gifts: GrantedGift[];
  applied: AppliedPromotion[];
  /** Discount on the goods only — always equal to the sum of `perLine`. */
  total: Money;
}

export interface ApplyPromotionsInput {
  /** Line nets *after* the company discount, before any promotion. */
  lines: EngineLine[];
  context: EngineContext;
  promotions: CompiledPromotion[];
  /** Freight before campaigns, excl. VAT. Absent means none is charged. */
  shippingFee?: Money;
}

function conditionsHold(promo: CompiledPromotion, state: {
  lines: EngineLine[];
  context: EngineContext;
  shippingFee: Money;
}): boolean {
  if (promo.conditions.length === 0) return true;
  return promo.conditionMode === "ANY"
    ? promo.conditions.some((c) => c.check(state))
    : promo.conditions.every((c) => c.check(state));
}

export function applyPromotions(input: ApplyPromotionsInput): PromotionResult {
  // Work on a copy: the caller's lines keep their pre-promotion nets.
  const state = {
    lines: input.lines.map((l) => ({ ...l })),
    context: input.context,
    shippingFee: input.shippingFee ?? ZERO,
  };
  const perLine = new Map<string, Money>();
  const applied: AppliedPromotion[] = [];
  const gifts: GrantedGift[] = [];
  let shippingDiscount = ZERO;
  let total = ZERO;

  const ordered = [...input.promotions].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );

  for (const promo of ordered) {
    if (!conditionsHold(promo, state)) continue;

    // `granted` is what the buyer sees this campaign gave them; `grantedGoods`
    // is the part that comes off the lines. They differ by the freight.
    let granted = ZERO;
    let grantedGoods = ZERO;
    const promoGifts: GrantedGift[] = [];

    for (const action of promo.actions) {
      const effect = action.apply(state);

      for (const [key, requested] of effect.perLine ?? []) {
        const line = state.lines.find((l) => l.key === key);
        if (!line || line.net.lte(ZERO)) continue;

        // Clamp again here: an action may not know what earlier actions in the
        // same promotion already took off this line.
        const amount = round2(requested.gt(line.net) ? line.net : requested);
        if (amount.lte(ZERO)) continue;

        line.net = round2(line.net.sub(amount));
        perLine.set(key, (perLine.get(key) ?? ZERO).add(amount));
        granted = granted.add(amount);
        grantedGoods = grantedGoods.add(amount);
      }

      if (effect.shipping && effect.shipping.gt(ZERO) && state.shippingFee.gt(ZERO)) {
        const amount = round2(
          effect.shipping.gt(state.shippingFee) ? state.shippingFee : effect.shipping,
        );
        state.shippingFee = round2(state.shippingFee.sub(amount));
        shippingDiscount = shippingDiscount.add(amount);
        granted = granted.add(amount);
      }

      for (const gift of effect.gifts ?? []) {
        if (gift.quantity > 0) {
          promoGifts.push({ promotionId: promo.id, ...gift });
        }
      }
    }

    // Conditions held but nothing came of it. A gift counts as something even
    // though its value is not known until the quote prices it.
    if (granted.lte(ZERO) && promoGifts.length === 0) continue;

    gifts.push(...promoGifts);
    applied.push({
      promotionId: promo.id,
      name: promo.name,
      code: promo.code,
      amount: round2(granted),
    });
    total = total.add(grantedGoods);

    if (promo.stopFurther) break;
  }

  return {
    perLine,
    shippingDiscount: round2(shippingDiscount),
    gifts,
    applied,
    total: round2(total),
  };
}
