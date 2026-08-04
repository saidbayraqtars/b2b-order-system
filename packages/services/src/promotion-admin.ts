import { Prisma, prisma } from "@repo/database";
import type {
  CreatePromotionInput,
  PromotionRuleInput,
  UpdatePromotionInput,
} from "@repo/types";
import { BusinessError } from "./errors";
import { compileAction, compileCondition } from "./promotion-registry";
import { normalizeCoupon } from "./promotion";

// Write side of the promotion engine. Every rule that arrives here is compiled
// against the registry before it is stored: a campaign that cannot be evaluated
// is never persisted, so an admin finds out at save time and not at checkout.

export interface PromotionRow {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  stopFurther: boolean;
  usageLimit: number | null;
  perCompanyLimit: number | null;
  conditions: PromotionRuleInput[];
  actions: PromotionRuleInput[];
  /** Redemptions on orders that are still alive, and what they gave away. */
  usedCount: number;
  discountGranted: string;
  createdAt: string;
}

export async function listPromotions(): Promise<PromotionRow[]> {
  const rows = await prisma.promotion.findMany({
    orderBy: [{ enabled: "desc" }, { priority: "asc" }, { createdAt: "desc" }],
  });
  if (rows.length === 0) return [];

  const usage = await prisma.promotionRedemption.groupBy({
    by: ["promotionId"],
    where: {
      promotionId: { in: rows.map((r) => r.id) },
      order: { status: { notIn: ["CANCELLED", "REJECTED"] } },
    },
    _count: { _all: true },
    _sum: { amount: true },
  });
  const byId = new Map(usage.map((u) => [u.promotionId, u]));

  return rows.map((r) => {
    const u = byId.get(r.id);
    return {
      ...toRow(r),
      usedCount: u?._count._all ?? 0,
      discountGranted: (u?._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    };
  });
}

export async function getPromotion(id: string): Promise<PromotionRow> {
  const row = await prisma.promotion.findUnique({ where: { id } });
  if (!row) {
    throw new BusinessError("PROMOTION_NOT_FOUND", "Kampanya bulunamadı");
  }
  const usage = await prisma.promotionRedemption.aggregate({
    where: {
      promotionId: id,
      order: { status: { notIn: ["CANCELLED", "REJECTED"] } },
    },
    _count: { _all: true },
    _sum: { amount: true },
  });

  return {
    ...toRow(row),
    usedCount: usage._count._all,
    discountGranted: (usage._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
  };
}

type PromotionRecord = Prisma.PromotionGetPayload<Record<string, never>>;

function toRow(r: PromotionRecord): Omit<PromotionRow, "usedCount" | "discountGranted"> {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    code: r.code,
    enabled: r.enabled,
    startsAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt?.toISOString() ?? null,
    priority: r.priority,
    stopFurther: r.stopFurther,
    usageLimit: r.usageLimit,
    perCompanyLimit: r.perCompanyLimit,
    conditions: asRules(r.conditions),
    actions: asRules(r.actions),
    createdAt: r.createdAt.toISOString(),
  };
}

function asRules(value: Prisma.JsonValue): PromotionRuleInput[] {
  return Array.isArray(value) ? (value as unknown as PromotionRuleInput[]) : [];
}

/**
 * Compile-check rules before they are written. The compiled result is thrown
 * away — this is a validation pass, and it is the same code path the engine
 * runs, so "it saved" means "it will evaluate".
 */
function assertRulesValid(input: {
  conditions?: PromotionRuleInput[];
  actions?: PromotionRuleInput[];
}): void {
  input.conditions?.forEach(compileCondition);
  input.actions?.forEach(compileAction);
}

async function assertCodeFree(code: string, exceptId?: string): Promise<void> {
  const existing = await prisma.promotion.findUnique({
    where: { code },
    select: { id: true },
  });
  if (existing && existing.id !== exceptId) {
    throw new BusinessError(
      "DUPLICATE_PROMOTION_CODE",
      "Bu kupon kodu başka bir kampanyada kullanılıyor",
    );
  }
}

export async function createPromotion(
  input: CreatePromotionInput,
): Promise<{ id: string }> {
  assertRulesValid(input);

  const code = normalizeCoupon(input.code ?? null);
  if (code) await assertCodeFree(code);

  return prisma.promotion.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      code,
      enabled: input.enabled ?? true,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      priority: input.priority ?? 0,
      stopFurther: input.stopFurther ?? false,
      usageLimit: input.usageLimit ?? null,
      perCompanyLimit: input.perCompanyLimit ?? null,
      conditions: input.conditions as unknown as Prisma.InputJsonValue,
      actions: input.actions as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

export async function updatePromotion(
  id: string,
  input: UpdatePromotionInput,
): Promise<{ id: string }> {
  const existing = await prisma.promotion.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new BusinessError("PROMOTION_NOT_FOUND", "Kampanya bulunamadı");
  }
  assertRulesValid(input);

  let code: string | null | undefined;
  if (input.code !== undefined) {
    code = normalizeCoupon(input.code);
    if (code) await assertCodeFree(code, id);
  }

  return prisma.promotion.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description ?? null }
        : {}),
      ...(code !== undefined ? { code } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.startsAt !== undefined
        ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
        : {}),
      ...(input.endsAt !== undefined
        ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.stopFurther !== undefined
        ? { stopFurther: input.stopFurther }
        : {}),
      ...(input.usageLimit !== undefined
        ? { usageLimit: input.usageLimit ?? null }
        : {}),
      ...(input.perCompanyLimit !== undefined
        ? { perCompanyLimit: input.perCompanyLimit ?? null }
        : {}),
      ...(input.conditions !== undefined
        ? { conditions: input.conditions as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.actions !== undefined
        ? { actions: input.actions as unknown as Prisma.InputJsonValue }
        : {}),
    },
    select: { id: true },
  });
}

/**
 * A campaign that has already discounted an order is never deleted — the orders
 * would lose the record of why they were cheaper. Disable it instead.
 */
export async function deletePromotion(id: string): Promise<void> {
  const promo = await prisma.promotion.findUnique({
    where: { id },
    select: { _count: { select: { redemptions: true } } },
  });
  if (!promo) {
    throw new BusinessError("PROMOTION_NOT_FOUND", "Kampanya bulunamadı");
  }
  if (promo._count.redemptions > 0) {
    throw new BusinessError(
      "IN_USE",
      "Siparişlerde kullanılmış kampanya silinemez, pasife alın",
      { redemptions: promo._count.redemptions },
    );
  }
  await prisma.promotion.delete({ where: { id } });
}
