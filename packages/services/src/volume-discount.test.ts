import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { companyTurnover, resolveVolumeDiscount } from "./volume-discount";

// resolveVolumeDiscount decides what every price on every screen is multiplied
// by, so the cases that matter are the ones where it must *not* discount:
// unreached thresholds, retired rungs, cancelled orders, and a MANUAL pin that
// has to ignore turnover entirely.

const D = (n: string | number) => new Prisma.Decimal(n);
const NOW = new Date("2026-08-06T12:00:00.000Z");

interface FakeTier {
  id: string;
  name: string;
  minRevenue: Prisma.Decimal;
  windowMonths: number;
  discountPercent: Prisma.Decimal;
  isActive?: boolean;
  sortOrder?: number;
}

function tier(
  id: string,
  minRevenue: string,
  discountPercent: string,
  over: Partial<FakeTier> = {},
): FakeTier {
  return {
    id,
    name: `Tier ${id}`,
    minRevenue: D(minRevenue),
    windowMonths: 12,
    discountPercent: D(discountPercent),
    isActive: true,
    sortOrder: 0,
    ...over,
  };
}

/**
 * A client that answers only what the resolver asks. `orders` maps a window in
 * months to the net turnover inside it, which is what the real aggregate
 * computes — the arithmetic behind that number is exercised separately by the
 * integration suite, where real Order rows exist.
 */
function client(opts: {
  tiers?: FakeTier[];
  orders?: Record<number, string>;
  /** Counts how many aggregates ran, to prove windows are not re-queried. */
  calls?: { aggregate: number };
}) {
  const tiers = opts.tiers ?? [];
  return {
    volumeTier: {
      findMany: async ({ where }: { where?: { isActive?: boolean } }) =>
        tiers.filter((t) => (where?.isActive ? t.isActive !== false : true)),
      findUnique: async ({ where }: { where: { id: string } }) =>
        tiers.find((t) => t.id === where.id) ?? null,
    },
    order: {
      aggregate: async ({ where }: { where: { createdAt: { gte: Date } } }) => {
        if (opts.calls) opts.calls.aggregate += 1;
        // Recover the window from the cut-off the resolver asked for.
        const months = Math.round(
          (NOW.getTime() - where.createdAt.gte.getTime()) / (30.44 * 86_400_000),
        );
        return {
          _sum: {
            subtotal: D(opts.orders?.[months] ?? "0"),
            discountTotal: D(0),
            promotionTotal: D(0),
          },
        };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const AUTO = {
  id: "company-1",
  volumeDiscountMode: "AUTO" as const,
  volumeTierId: null,
};

describe("resolveVolumeDiscount — AUTO", () => {
  it("gives nothing when no ladder is defined", () => {
    // Every company is AUTO by default, so this is what the whole customer base
    // must resolve to before an admin writes the first rung.
    return expect(
      resolveVolumeDiscount(client({}), AUTO, NOW),
    ).resolves.toBeNull();
  });

  it("gives nothing when the threshold is not reached", async () => {
    const r = await resolveVolumeDiscount(
      client({ tiers: [tier("t1", "500000", "5")], orders: { 12: "499999.99" } }),
      AUTO,
      NOW,
    );
    expect(r).toBeNull();
  });

  it("awards the rung once the threshold is met exactly", async () => {
    const r = await resolveVolumeDiscount(
      client({ tiers: [tier("t1", "500000", "5")], orders: { 12: "500000.00" } }),
      AUTO,
      NOW,
    );
    expect(r?.percent.toFixed(2)).toBe("5.00");
    expect(r?.earnedWith?.toFixed(2)).toBe("500000.00");
  });

  it("takes the rung that pays most, not the highest threshold", async () => {
    // A short-window rung can beat a yearly one. Ordering by money spent would
    // compare a month against a year and hand out the wrong rate.
    const r = await resolveVolumeDiscount(
      client({
        tiers: [
          tier("year", "500000", "5"),
          tier("month", "80000", "6", { windowMonths: 1 }),
        ],
        orders: { 12: "900000", 1: "90000" },
      }),
      AUTO,
      NOW,
    );
    expect(r?.tierId).toBe("month");
    expect(r?.percent.toFixed(2)).toBe("6.00");
  });

  it("ignores a retired rung", async () => {
    const r = await resolveVolumeDiscount(
      client({
        tiers: [
          tier("live", "100000", "2"),
          tier("retired", "100000", "9", { isActive: false }),
        ],
        orders: { 12: "900000" },
      }),
      AUTO,
      NOW,
    );
    expect(r?.tierId).toBe("live");
  });

  it("asks for each window once, however many rungs share it", async () => {
    const calls = { aggregate: 0 };
    await resolveVolumeDiscount(
      client({
        tiers: [
          tier("t1", "100000", "1"),
          tier("t2", "300000", "3"),
          tier("t3", "500000", "5"),
          tier("t4", "50000", "2", { windowMonths: 3 }),
        ],
        orders: { 12: "600000", 3: "10000" },
        calls,
      }),
      AUTO,
      NOW,
    );
    // Four rungs, two distinct windows.
    expect(calls.aggregate).toBe(2);
  });

  it("breaks a tie on the harder threshold so pricing is repeatable", async () => {
    const r = await resolveVolumeDiscount(
      client({
        tiers: [tier("easy", "100000", "4"), tier("hard", "400000", "4")],
        orders: { 12: "900000" },
      }),
      AUTO,
      NOW,
    );
    expect(r?.tierId).toBe("hard");
  });
});

describe("resolveVolumeDiscount — MANUAL", () => {
  const pinned = (volumeTierId: string | null) => ({
    id: "company-1",
    volumeDiscountMode: "MANUAL" as const,
    volumeTierId,
  });

  it("honours the pin without looking at turnover at all", async () => {
    const calls = { aggregate: 0 };
    const r = await resolveVolumeDiscount(
      client({ tiers: [tier("gold", "500000", "5")], orders: { 12: "0" }, calls }),
      pinned("gold"),
      NOW,
    );
    expect(r?.percent.toFixed(2)).toBe("5.00");
    // A promise that re-derived itself from a slow quarter would not be one.
    expect(calls.aggregate).toBe(0);
    expect(r?.earnedWith).toBeNull();
  });

  it("honours a pin to a rung that has since been retired", async () => {
    // Retiring a rung takes it off the ladder; it does not cancel a rate an
    // admin promised one customer, which would reprice them mid-contract.
    const r = await resolveVolumeDiscount(
      client({ tiers: [tier("gold", "500000", "5", { isActive: false })] }),
      pinned("gold"),
      NOW,
    );
    expect(r?.percent.toFixed(2)).toBe("5.00");
  });

  it("treats a cleared pin as 'no hacim discount for this customer'", async () => {
    const r = await resolveVolumeDiscount(
      client({ tiers: [tier("gold", "1", "5")], orders: { 12: "900000" } }),
      pinned(null),
      NOW,
    );
    expect(r).toBeNull();
  });

  it("gives nothing when the pinned rung was deleted out from under it", async () => {
    const r = await resolveVolumeDiscount(client({ tiers: [] }), pinned("gone"), NOW);
    expect(r).toBeNull();
  });
});

describe("companyTurnover", () => {
  it("counts goods only — discounts and campaigns come off, VAT never counted", async () => {
    const c = {
      order: {
        aggregate: async () => ({
          _sum: {
            subtotal: D("100000"),
            discountTotal: D("10000"),
            promotionTotal: D("5000"),
          },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const total = await companyTurnover(c, "company-1", 12, NOW);
    expect(total.toFixed(2)).toBe("85000.00");
  });

  it("reads zero, not null, from a customer that has never ordered", async () => {
    const c = {
      order: {
        aggregate: async () => ({
          _sum: { subtotal: null, discountTotal: null, promotionTotal: null },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect((await companyTurnover(c, "company-1", 12, NOW)).toFixed(2)).toBe("0.00");
  });

  it("excludes drafts, cancellations and rejections", async () => {
    // The same set the promotion engine's FIRST_ORDER condition uses — a
    // customer a campaign treats as returning cannot have zero turnover here.
    let seen: unknown;
    const c = {
      order: {
        aggregate: async (args: { where: { status: { notIn: string[] } } }) => {
          seen = args.where.status.notIn;
          return {
            _sum: { subtotal: D(0), discountTotal: D(0), promotionTotal: D(0) },
          };
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    await companyTurnover(c, "company-1", 12, NOW);
    expect(seen).toEqual(["DRAFT", "CANCELLED", "REJECTED"]);
  });
});
