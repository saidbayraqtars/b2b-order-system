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
 *  - A line can never go below zero, and a promotion that ends up granting
 *    nothing is not recorded as applied.
 *  - `stopFurther` ends the run after the promotion that carries it applies —
 *    that is how an exclusive campaign is expressed.
 */

export interface CompiledPromotion {
  id: string;
  name: string;
  /** null for automatic promotions. */
  code: string | null;
  priority: number;
  stopFurther: boolean;
  conditions: CompiledCondition[];
  actions: CompiledAction[];
}

export interface AppliedPromotion {
  promotionId: string;
  name: string;
  code: string | null;
  /** Total discount this promotion granted, excl. VAT. */
  amount: Money;
}

export interface PromotionResult {
  /** Discount per line key; lines that got nothing are absent. */
  perLine: Map<string, Money>;
  applied: AppliedPromotion[];
  total: Money;
}

export interface ApplyPromotionsInput {
  /** Line nets *after* the company discount, before any promotion. */
  lines: EngineLine[];
  context: EngineContext;
  promotions: CompiledPromotion[];
}

export function applyPromotions(input: ApplyPromotionsInput): PromotionResult {
  // Work on a copy: the caller's lines keep their pre-promotion nets.
  const state = {
    lines: input.lines.map((l) => ({ ...l })),
    context: input.context,
  };
  const perLine = new Map<string, Money>();
  const applied: AppliedPromotion[] = [];
  let total = ZERO;

  const ordered = [...input.promotions].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );

  for (const promo of ordered) {
    if (!promo.conditions.every((c) => c.check(state))) continue;

    let granted = ZERO;
    for (const action of promo.actions) {
      for (const [key, requested] of action.discount(state)) {
        const line = state.lines.find((l) => l.key === key);
        if (!line || line.net.lte(ZERO)) continue;

        // Clamp again here: an action may not know what earlier actions in the
        // same promotion already took off this line.
        const amount = round2(requested.gt(line.net) ? line.net : requested);
        if (amount.lte(ZERO)) continue;

        line.net = round2(line.net.sub(amount));
        perLine.set(key, (perLine.get(key) ?? ZERO).add(amount));
        granted = granted.add(amount);
      }
    }

    if (granted.lte(ZERO)) continue; // conditions held but nothing to give

    applied.push({
      promotionId: promo.id,
      name: promo.name,
      code: promo.code,
      amount: round2(granted),
    });
    total = total.add(granted);

    if (promo.stopFurther) break;
  }

  return { perLine, applied, total: round2(total) };
}
