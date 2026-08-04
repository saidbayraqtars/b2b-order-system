import { Prisma, prisma } from "@repo/database";
import type { PaymentMethod } from "@repo/types";
import { BusinessError } from "./errors";
import type { Money } from "./money";
import type { AppliedPromotion, CompiledPromotion } from "./promotion-engine";
import {
  compileAction,
  compileCondition,
  type EngineContext,
} from "./promotion-registry";

// Database side of the promotion engine: which campaigns a given cart is even
// allowed to see, and the redemption rows that both prove and meter usage.

/** Works with the request-scoped client or inside an order transaction. */
type Client = Prisma.TransactionClient;

export interface LoadPromotionsParams {
  companyId: string;
  /** Raw code as typed; matched case-insensitively. */
  couponCode?: string | null;
  now?: Date;
}

export interface LoadedPromotions {
  promotions: CompiledPromotion[];
  /**
   * True when a coupon was given and a usable campaign carries that code.
   * False means unknown / disabled / outside its window / quota exhausted —
   * the caller turns that into the message the buyer sees.
   */
  couponFound: boolean;
}

export function normalizeCoupon(code: string | null | undefined): string | null {
  const trimmed = code?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

/**
 * Every automatic campaign, plus the coupon campaign if one was typed, that is
 * enabled, inside its date window, and has not used up its quota. Conditions are
 * NOT evaluated here — that is the engine's job, because they depend on the cart.
 *
 * A stored rule is re-validated against the registry on the way out. A row that
 * no longer compiles (hand-edited, or written by an older version of the
 * catalogue) is dropped rather than allowed to break checkout, and logged.
 */
export async function loadEligiblePromotions(
  client: Client,
  params: LoadPromotionsParams,
): Promise<LoadedPromotions> {
  const now = params.now ?? new Date();
  const coupon = normalizeCoupon(params.couponCode);

  const rows = await client.promotion.findMany({
    where: {
      enabled: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        { OR: coupon ? [{ code: null }, { code: coupon }] : [{ code: null }] },
      ],
    },
    select: {
      id: true,
      name: true,
      code: true,
      priority: true,
      stopFurther: true,
      usageLimit: true,
      perCompanyLimit: true,
      conditions: true,
      actions: true,
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length === 0) return { promotions: [], couponFound: false };

  const usage = await redemptionCounts(
    client,
    rows.map((r) => r.id),
    params.companyId,
  );

  const promotions: CompiledPromotion[] = [];
  let couponFound = false;

  for (const row of rows) {
    const used = usage.get(row.id) ?? { total: 0, company: 0 };
    if (row.usageLimit !== null && used.total >= row.usageLimit) continue;
    if (row.perCompanyLimit !== null && used.company >= row.perCompanyLimit) {
      continue;
    }

    let compiled: CompiledPromotion;
    try {
      compiled = {
        id: row.id,
        name: row.name,
        code: row.code,
        priority: row.priority,
        stopFurther: row.stopFurther,
        conditions: asArray(row.conditions).map(compileCondition),
        actions: asArray(row.actions).map(compileAction),
      };
    } catch (err) {
      console.error(
        `Kampanya ${row.id} (${row.name}) geçersiz kural içeriyor, atlandı`,
        err,
      );
      continue;
    }
    if (compiled.actions.length === 0) continue;

    if (row.code !== null) couponFound = true;
    promotions.push(compiled);
  }

  return { promotions, couponFound };
}

function asArray(value: Prisma.JsonValue): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Redemptions per promotion: total, and this company's own.
 *
 * Only orders that are still alive count. A cancelled or rejected order hands
 * its quota back without deleting anything, so the order detail can still show
 * which campaign gave it what.
 */
async function redemptionCounts(
  client: Client,
  promotionIds: string[],
  companyId: string,
): Promise<Map<string, { total: number; company: number }>> {
  const rows = await client.promotionRedemption.groupBy({
    by: ["promotionId", "companyId"],
    where: {
      promotionId: { in: promotionIds },
      order: { status: { notIn: ["CANCELLED", "REJECTED"] } },
    },
    _count: { _all: true },
  });

  const out = new Map<string, { total: number; company: number }>();
  for (const row of rows) {
    const entry = out.get(row.promotionId) ?? { total: 0, company: 0 };
    entry.total += row._count._all;
    if (row.companyId === companyId) entry.company += row._count._all;
    out.set(row.promotionId, entry);
  }
  return out;
}

/** Orders that count as "already placed" for the FIRST_ORDER condition. */
export async function buildEngineContext(
  client: Client,
  params: {
    companyId: string;
    customerGroupId: string | null;
    paymentMethod: PaymentMethod;
    now?: Date;
  },
): Promise<EngineContext> {
  const previousOrderCount = await client.order.count({
    where: {
      companyId: params.companyId,
      status: { notIn: ["CANCELLED", "REJECTED", "DRAFT"] },
    },
  });

  return {
    companyId: params.companyId,
    customerGroupId: params.customerGroupId,
    paymentMethod: params.paymentMethod,
    previousOrderCount,
    now: params.now ?? new Date(),
  };
}

/**
 * A coupon was typed but no campaign with that code took effect. Told apart so
 * the buyer knows whether the code is wrong or the cart simply doesn't qualify.
 */
export function assertCouponApplied(
  coupon: string | null,
  couponFound: boolean,
  applied: AppliedPromotion[],
): void {
  if (!coupon) return;
  if (applied.some((a) => a.code === coupon)) return;

  throw couponFound
    ? new BusinessError(
        "COUPON_INVALID",
        "Kupon bu sepet için geçerli değil",
        { code: coupon },
      )
    : new BusinessError(
        "COUPON_INVALID",
        "Kupon kodu geçersiz ya da süresi dolmuş",
        { code: coupon },
      );
}

/** Write the usage rows for an order. Also the audit trail of what was granted. */
export async function recordRedemptions(
  tx: Client,
  params: { orderId: string; companyId: string; applied: AppliedPromotion[] },
): Promise<void> {
  if (params.applied.length === 0) return;
  await tx.promotionRedemption.createMany({
    data: params.applied.map((a) => ({
      promotionId: a.promotionId,
      orderId: params.orderId,
      companyId: params.companyId,
      amount: a.amount,
    })),
  });
}

/** Promotions granted on one order, for the order detail screen. */
export interface OrderPromotionRow {
  promotionId: string;
  name: string;
  code: string | null;
  amount: string;
}

export async function listOrderPromotions(
  orderId: string,
): Promise<OrderPromotionRow[]> {
  const rows = await prisma.promotionRedemption.findMany({
    where: { orderId },
    select: {
      promotionId: true,
      amount: true,
      promotion: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    promotionId: r.promotionId,
    name: r.promotion.name,
    code: r.promotion.code,
    amount: (r.amount as Money).toFixed(2),
  }));
}
