import { Prisma, prisma } from "@repo/database";
import type { VolumeDiscountMode } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, ZERO, round2 } from "./money";
import type { Money } from "./money";
import { UNTRADED_ORDER_STATUSES } from "./order-status";

// Hacim iskontosu: what a customer earns by trading, as opposed to what it was
// given (CompanyDiscount) or what a campaign hands out (Promotion).
//
// Three things are decided here and nowhere else:
//  1. What "turnover" means — net goods, VAT and freight excluded.
//  2. Which rung a customer is on, given that ladder.
//  3. That a MANUAL pin skips 1 and 2 entirely.
//
// The rate then leaves through one door: `resolvePrice`. Nothing multiplies a
// percentage by a price outside pricing.ts, so the catalogue, the cart, the
// quote and the order cannot disagree about what a tier is worth.

type Client = Prisma.TransactionClient;

/** The rate a company is priced at right now, plus who granted it. */
export interface ResolvedVolumeDiscount {
  tierId: string;
  tierName: string;
  /** Percent off, applied after the company's own discount. Always > 0. */
  percent: Money;
  /**
   * Turnover the rung was earned with, or null when it was pinned by an admin —
   * the difference matters on screen: "1.240.000 ₺ ciro ile" versus "elle
   * atanmış".
   */
  earnedWith: Money | null;
}

/** What the pricing path needs from a company to answer the question. */
export interface VolumeDiscountSubject {
  id: string;
  volumeDiscountMode: VolumeDiscountMode;
  volumeTierId: string | null;
}

interface TierRow {
  id: string;
  name: string;
  minRevenue: Money;
  windowMonths: number;
  discountPercent: Money;
}

/**
 * The rate this company is priced at.
 *
 * MANUAL is answered without touching orders at all: the pin is the promise,
 * and a promise that quietly re-derived itself from a slow quarter would not be
 * one. An inactive rung is still honoured when pinned — an admin retiring a
 * rung from the ladder is not the same act as taking it away from the customer
 * it was promised to, and silently repricing that customer mid-contract is the
 * worse failure.
 *
 * Returns null when no rung applies, which is also the answer for every company
 * before any tier is defined.
 */
export async function resolveVolumeDiscount(
  client: Client,
  company: VolumeDiscountSubject,
  now: Date = new Date(),
): Promise<ResolvedVolumeDiscount | null> {
  if (company.volumeDiscountMode === "MANUAL") {
    if (!company.volumeTierId) return null;
    const tier = await client.volumeTier.findUnique({
      where: { id: company.volumeTierId },
      select: { id: true, name: true, discountPercent: true },
    });
    if (!tier || tier.discountPercent.lte(ZERO)) return null;
    return {
      tierId: tier.id,
      tierName: tier.name,
      percent: tier.discountPercent,
      earnedWith: null,
    };
  }

  const tiers = await listActiveTiers(client);
  if (tiers.length === 0) return null;

  const turnover = await turnoverByWindow(client, company.id, tiers, now);
  return bestTier(tiers, turnover);
}

async function listActiveTiers(client: Client): Promise<TierRow[]> {
  return client.volumeTier.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      minRevenue: true,
      windowMonths: true,
      discountPercent: true,
    },
    orderBy: [{ sortOrder: "asc" }, { minRevenue: "asc" }],
  });
}

/**
 * Pick the rung that pays the customer most among those it qualifies for.
 *
 * "Highest rate", not "highest threshold": rungs may have different windows, so
 * ordering them by money spent would compare a year against a month. Ties break
 * on the harder threshold, then on id, so the same inputs always price the same.
 */
function bestTier(
  tiers: TierRow[],
  turnover: Map<number, Money>,
): ResolvedVolumeDiscount | null {
  let best: TierRow | null = null;
  let bestRevenue: Money = ZERO;

  for (const tier of tiers) {
    if (tier.discountPercent.lte(ZERO)) continue;
    const revenue = turnover.get(tier.windowMonths) ?? ZERO;
    if (revenue.lt(tier.minRevenue)) continue;

    if (
      best === null ||
      tier.discountPercent.gt(best.discountPercent) ||
      (tier.discountPercent.eq(best.discountPercent) &&
        (tier.minRevenue.gt(best.minRevenue) ||
          (tier.minRevenue.eq(best.minRevenue) && tier.id < best.id)))
    ) {
      best = tier;
      bestRevenue = revenue;
    }
  }

  if (!best) return null;
  return {
    tierId: best.id,
    tierName: best.name,
    percent: best.discountPercent,
    earnedWith: bestRevenue,
  };
}

/**
 * Turnover for each distinct window the ladder uses, in one query per window.
 *
 * Grouped rather than one query per rung: a five-rung ladder on a single
 * 12-month window is the normal shape, and that must cost one aggregate, not
 * five.
 */
async function turnoverByWindow(
  client: Client,
  companyId: string,
  tiers: TierRow[],
  now: Date,
): Promise<Map<number, Money>> {
  const windows = [...new Set(tiers.map((t) => t.windowMonths))];
  const out = new Map<number, Money>();

  await Promise.all(
    windows.map(async (months) => {
      out.set(months, await companyTurnover(client, companyId, months, now));
    }),
  );

  return out;
}

/**
 * What the customer has bought in the last `windowMonths`, excl. VAT and freight.
 *
 * `subtotal - discountTotal - promotionTotal` is the goods actually paid for.
 * Gross subtotal would reward a customer for discounts it was given, and
 * grandTotal would count the state's VAT and the carrier's freight as our
 * revenue — a customer ordering heavy goods would climb the ladder faster than
 * one buying the same value of light ones.
 */
export async function companyTurnover(
  client: Client,
  companyId: string,
  windowMonths: number,
  now: Date = new Date(),
): Promise<Money> {
  const since = new Date(now);
  since.setMonth(since.getMonth() - windowMonths);

  const agg = await client.order.aggregate({
    where: {
      companyId,
      createdAt: { gte: since },
      status: { notIn: [...UNTRADED_ORDER_STATUSES] },
    },
    _sum: { subtotal: true, discountTotal: true, promotionTotal: true },
  });

  const net = (agg._sum.subtotal ?? ZERO)
    .sub(agg._sum.discountTotal ?? ZERO)
    .sub(agg._sum.promotionTotal ?? ZERO);
  return net.lt(ZERO) ? ZERO : round2(net);
}

// ─────────────────────────────────────────────
// WHAT THE CUSTOMER IS TOLD
// ─────────────────────────────────────────────

export interface VolumeStatus {
  mode: VolumeDiscountMode;
  /** The rung in force, or null when none applies. */
  current: { tierId: string; name: string; percent: string } | null;
  /** Turnover in the current rung's window; null under MANUAL. */
  turnover: string | null;
  /** Window the turnover above was measured over; null under MANUAL. */
  windowMonths: number | null;
  /**
   * The cheapest rung that would pay better than the current one, and what is
   * still missing. Null when the customer is already on the best rung it can
   * reach, or when the tier was pinned — an earned target is a reason to buy
   * more, a pinned one is not.
   */
  next: { name: string; percent: string; remaining: string; windowMonths: number } | null;
}

/**
 * The ladder from this customer's point of view — for the portal ("%3, bir üst
 * basamağa 260.000 ₺ kaldı") and for the admin looking at one cari.
 */
export async function getVolumeStatus(
  companyId: string,
  now: Date = new Date(),
): Promise<VolumeStatus> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, volumeDiscountMode: true, volumeTierId: true },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı", { companyId });
  }

  const resolved = await resolveVolumeDiscount(prisma, company, now);
  const current = resolved
    ? {
        tierId: resolved.tierId,
        name: resolved.tierName,
        percent: resolved.percent.toFixed(2),
      }
    : null;

  if (company.volumeDiscountMode === "MANUAL") {
    return { mode: "MANUAL", current, turnover: null, windowMonths: null, next: null };
  }

  const tiers = await listActiveTiers(prisma);
  if (tiers.length === 0) {
    return { mode: "AUTO", current, turnover: null, windowMonths: null, next: null };
  }

  const turnover = await turnoverByWindow(prisma, companyId, tiers, now);

  // Report the window the customer is actually being measured on: the one its
  // rung uses, or — before it has earned anything — the ladder's most common
  // window, which is the horizon the thresholds on screen refer to.
  const currentTier = tiers.find((t) => t.id === resolved?.tierId);
  const shownWindow = currentTier?.windowMonths ?? commonWindow(tiers);

  return {
    mode: "AUTO",
    current,
    turnover: (turnover.get(shownWindow) ?? ZERO).toFixed(2),
    windowMonths: shownWindow,
    next: nextTier(tiers, turnover, resolved),
  };
}

/** Cheapest step up: the smallest gap among rungs that pay more than today's. */
function nextTier(
  tiers: TierRow[],
  turnover: Map<number, Money>,
  current: ResolvedVolumeDiscount | null,
): VolumeStatus["next"] {
  const floor = current ? current.percent : ZERO;
  let best: { tier: TierRow; remaining: Money } | null = null;

  for (const tier of tiers) {
    if (tier.discountPercent.lte(floor)) continue;
    const revenue = turnover.get(tier.windowMonths) ?? ZERO;
    const remaining = tier.minRevenue.sub(revenue);
    if (remaining.lte(ZERO)) continue; // already qualifies; bestTier passed it over
    if (best === null || remaining.lt(best.remaining)) best = { tier, remaining };
  }

  if (!best) return null;
  return {
    name: best.tier.name,
    percent: best.tier.discountPercent.toFixed(2),
    remaining: round2(best.remaining).toFixed(2),
    windowMonths: best.tier.windowMonths,
  };
}

/** The window most rungs are written against — the ladder's headline horizon. */
function commonWindow(tiers: TierRow[]): number {
  const counts = new Map<number, number>();
  for (const t of tiers) {
    counts.set(t.windowMonths, (counts.get(t.windowMonths) ?? 0) + 1);
  }
  let winner = tiers[0]?.windowMonths ?? 12;
  let most = 0;
  for (const [months, n] of counts) {
    if (n > most || (n === most && months > winner)) {
      winner = months;
      most = n;
    }
  }
  return winner;
}

// ─────────────────────────────────────────────
// ADMIN: BASAMAK TANIMLARI
// ─────────────────────────────────────────────

export interface VolumeTierRow {
  id: string;
  name: string;
  minRevenue: string;
  windowMonths: number;
  discountPercent: string;
  isActive: boolean;
  sortOrder: number;
  /** Companies pinned to this rung — the delete guard reads it. */
  companyCount: number;
}

const tierSelect = {
  id: true,
  name: true,
  minRevenue: true,
  windowMonths: true,
  discountPercent: true,
  isActive: true,
  sortOrder: true,
  _count: { select: { companies: true } },
} satisfies Prisma.VolumeTierSelect;

type TierPayload = Prisma.VolumeTierGetPayload<{ select: typeof tierSelect }>;

function toRow(t: TierPayload): VolumeTierRow {
  return {
    id: t.id,
    name: t.name,
    minRevenue: t.minRevenue.toFixed(2),
    windowMonths: t.windowMonths,
    discountPercent: t.discountPercent.toFixed(2),
    isActive: t.isActive,
    sortOrder: t.sortOrder,
    companyCount: t._count.companies,
  };
}

export async function listVolumeTiers(): Promise<VolumeTierRow[]> {
  const rows = await prisma.volumeTier.findMany({
    orderBy: [{ sortOrder: "asc" }, { minRevenue: "asc" }],
    select: tierSelect,
  });
  return rows.map(toRow);
}

export interface VolumeTierInput {
  name: string;
  minRevenue: number;
  windowMonths: number;
  discountPercent: number;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createVolumeTier(
  input: VolumeTierInput,
): Promise<VolumeTierRow> {
  return withTierErrors(async () => {
    const row = await prisma.volumeTier.create({
      data: {
        name: input.name.trim(),
        minRevenue: new Dec(input.minRevenue),
        windowMonths: input.windowMonths,
        discountPercent: new Dec(input.discountPercent),
        isActive: input.isActive ?? true,
        // Rungs read as a ladder, so an unsorted one lands where its threshold
        // puts it rather than at the top.
        sortOrder: input.sortOrder ?? Math.round(input.minRevenue / 1000),
      },
      select: tierSelect,
    });
    return toRow(row);
  });
}

export async function updateVolumeTier(
  id: string,
  input: Partial<VolumeTierInput>,
): Promise<VolumeTierRow> {
  return withTierErrors(async () => {
    const row = await prisma.volumeTier.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.minRevenue !== undefined
          ? { minRevenue: new Dec(input.minRevenue) }
          : {}),
        ...(input.windowMonths !== undefined
          ? { windowMonths: input.windowMonths }
          : {}),
        ...(input.discountPercent !== undefined
          ? { discountPercent: new Dec(input.discountPercent) }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      select: tierSelect,
    });
    return toRow(row);
  });
}

/**
 * A rung customers are pinned to cannot be deleted — those customers would
 * silently lose the rate they were promised, with nothing left on screen to
 * explain the price change. Deactivating keeps it readable next to the orders
 * sold on it, and pinned customers keep their promise (see resolveVolumeDiscount).
 */
export async function deleteVolumeTier(id: string): Promise<void> {
  const tier = await prisma.volumeTier.findUnique({
    where: { id },
    select: { _count: { select: { companies: true } } },
  });
  if (!tier) {
    throw new BusinessError("VOLUME_TIER_NOT_FOUND", "Hacim basamağı bulunamadı");
  }
  if (tier._count.companies > 0) {
    throw new BusinessError(
      "VOLUME_TIER_IN_USE",
      `${tier._count.companies} firmaya atanmış basamak silinemez — pasife alın`,
    );
  }
  await prisma.volumeTier.delete({ where: { id } });
}

async function withTierErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        throw new BusinessError(
          "VOLUME_TIER_NAME_TAKEN",
          "Bu isimde bir hacim basamağı zaten var",
        );
      }
      if (e.code === "P2025") {
        throw new BusinessError("VOLUME_TIER_NOT_FOUND", "Hacim basamağı bulunamadı");
      }
    }
    throw e;
  }
}
