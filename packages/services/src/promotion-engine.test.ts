import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { applyPromotions, type CompiledPromotion } from "./promotion-engine";
import {
  allocateProRata,
  compileAction,
  compileCondition,
  type EngineContext,
  type EngineLine,
} from "./promotion-registry";
import { BusinessError } from "./errors";

const D = (n: string | number) => new Prisma.Decimal(n);

const CONTEXT: EngineContext = {
  companyId: "company-1",
  customerGroupId: "group-1",
  paymentMethod: "OPEN_ACCOUNT",
  previousOrderCount: 3,
  now: new Date("2026-08-04T10:00:00Z"),
};

function line(
  key: string,
  net: string,
  extra: Partial<EngineLine> = {},
): EngineLine {
  return {
    key,
    productId: `prod-${key}`,
    categoryId: "cat-1",
    quantity: 10,
    net: D(net),
    ...extra,
  };
}

function promo(
  id: string,
  conditions: unknown[],
  actions: unknown[],
  extra: Partial<CompiledPromotion> = {},
): CompiledPromotion {
  return {
    id,
    name: `Kampanya ${id}`,
    code: null,
    priority: 0,
    stopFurther: false,
    conditionMode: "ALL",
    conditions: conditions.map(compileCondition),
    actions: actions.map(compileAction),
    ...extra,
  };
}

describe("applyPromotions", () => {
  it("gives nothing when a condition does not hold", () => {
    const result = applyPromotions({
      lines: [line("a", "500.00")],
      context: CONTEXT,
      promotions: [
        promo(
          "p1",
          [{ type: "MIN_ORDER_SUBTOTAL", params: { amount: 1000 } }],
          [{ type: "PERCENT_OFF", params: { percent: 10 } }],
        ),
      ],
    });
    expect(result.total.toFixed(2)).toBe("0.00");
    expect(result.applied).toHaveLength(0);
  });

  it("applies a percentage to every matching line", () => {
    const result = applyPromotions({
      lines: [line("a", "600.00"), line("b", "400.00")],
      context: CONTEXT,
      promotions: [
        promo(
          "p1",
          [{ type: "MIN_ORDER_SUBTOTAL", params: { amount: 1000 } }],
          [{ type: "PERCENT_OFF", params: { percent: 10 } }],
        ),
      ],
    });
    expect(result.total.toFixed(2)).toBe("100.00");
    expect(result.perLine.get("a")!.toFixed(2)).toBe("60.00");
    expect(result.perLine.get("b")!.toFixed(2)).toBe("40.00");
  });

  it("compounds: the second campaign sees what the first one left", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      promotions: [
        promo("p1", [], [{ type: "PERCENT_OFF", params: { percent: 10 } }], {
          priority: 1,
        }),
        promo("p2", [], [{ type: "PERCENT_OFF", params: { percent: 10 } }], {
          priority: 2,
        }),
      ],
    });
    // 1000 → 100 off → 900 → 90 off. Not 200: the second reads the running net.
    expect(result.applied.map((a) => a.amount.toFixed(2))).toEqual([
      "100.00",
      "90.00",
    ]);
    expect(result.total.toFixed(2)).toBe("190.00");
  });

  it("runs in priority order regardless of input order", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      promotions: [
        promo("late", [], [{ type: "PERCENT_OFF", params: { percent: 50 } }], {
          priority: 90,
        }),
        promo("early", [], [{ type: "FIXED_OFF_ORDER", params: { amount: 200 } }], {
          priority: 10,
        }),
      ],
    });
    // early first: 1000 − 200 = 800, then 50 % of 800 = 400.
    expect(result.applied.map((a) => a.promotionId)).toEqual(["early", "late"]);
    expect(result.total.toFixed(2)).toBe("600.00");
  });

  it("stops after a stopFurther campaign applies", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      promotions: [
        promo("excl", [], [{ type: "PERCENT_OFF", params: { percent: 10 } }], {
          priority: 1,
          stopFurther: true,
        }),
        promo("next", [], [{ type: "PERCENT_OFF", params: { percent: 10 } }], {
          priority: 2,
        }),
      ],
    });
    expect(result.applied).toHaveLength(1);
    expect(result.total.toFixed(2)).toBe("100.00");
  });

  it("does not stop on a campaign that qualified but granted nothing", () => {
    const result = applyPromotions({
      lines: [line("a", "0.00")],
      context: CONTEXT,
      promotions: [
        promo("empty", [], [{ type: "PERCENT_OFF", params: { percent: 10 } }], {
          priority: 1,
          stopFurther: true,
        }),
        promo("real", [], [{ type: "FIXED_OFF_UNIT", params: { amount: 1 } }], {
          priority: 2,
        }),
      ],
    });
    // The first campaign had nothing to take, so it never counted as applied and
    // its exclusivity never kicked in.
    expect(result.applied).toHaveLength(0);
    expect(result.total.toFixed(2)).toBe("0.00");
  });

  it("never takes a line below zero", () => {
    const result = applyPromotions({
      lines: [line("a", "50.00")],
      context: CONTEXT,
      promotions: [
        promo("p1", [], [{ type: "FIXED_OFF_ORDER", params: { amount: 999 } }]),
      ],
    });
    expect(result.total.toFixed(2)).toBe("50.00");
    expect(result.perLine.get("a")!.toFixed(2)).toBe("50.00");
  });

  it("targets only the categories the action names", () => {
    const result = applyPromotions({
      lines: [
        line("a", "1000.00", { categoryId: "cat-hedef" }),
        line("b", "1000.00", { categoryId: "cat-diger" }),
      ],
      context: CONTEXT,
      promotions: [
        promo(
          "p1",
          [],
          [{ type: "PERCENT_OFF", params: { percent: 10, categoryIds: ["cat-hedef"] } }],
        ),
      ],
    });
    expect(result.perLine.get("a")!.toFixed(2)).toBe("100.00");
    expect(result.perLine.has("b")).toBe(false);
  });

  it("counts only matching lines for MIN_ITEM_QUANTITY", () => {
    const promotions = [
      promo(
        "p1",
        [
          {
            type: "MIN_ITEM_QUANTITY",
            params: { quantity: 15, categoryIds: ["cat-hedef"] },
          },
        ],
        [{ type: "PERCENT_OFF", params: { percent: 10 } }],
      ),
    ];
    const lines = [
      line("a", "100.00", { categoryId: "cat-hedef", quantity: 10 }),
      line("b", "100.00", { categoryId: "cat-diger", quantity: 10 }),
    ];
    // 10 matching units < 15 even though the cart holds 20 in total.
    expect(applyPromotions({ lines, context: CONTEXT, promotions }).total.toFixed(2)).toBe(
      "0.00",
    );
  });

  it("reads FIRST_ORDER from the context", () => {
    const promotions = [
      promo(
        "p1",
        [{ type: "FIRST_ORDER", params: {} }],
        [{ type: "FIXED_OFF_ORDER", params: { amount: 100 } }],
      ),
    ];
    const lines = [line("a", "1000.00")];
    expect(applyPromotions({ lines, context: CONTEXT, promotions }).total.toFixed(2)).toBe(
      "0.00",
    );
    expect(
      applyPromotions({
        lines,
        context: { ...CONTEXT, previousOrderCount: 0 },
        promotions,
      }).total.toFixed(2),
    ).toBe("100.00");
  });

  it("leaves the caller's lines untouched", () => {
    const lines = [line("a", "1000.00")];
    applyPromotions({
      lines,
      context: CONTEXT,
      promotions: [promo("p1", [], [{ type: "PERCENT_OFF", params: { percent: 10 } }])],
    });
    expect(lines[0]!.net.toFixed(2)).toBe("1000.00");
  });
});

describe("allocateProRata", () => {
  it("splits in proportion to line net", () => {
    const out = allocateProRata([line("a", "750.00"), line("b", "250.00")], D(100));
    expect(out.get("a")!.toFixed(2)).toBe("75.00");
    expect(out.get("b")!.toFixed(2)).toBe("25.00");
  });

  it("hands the rounding remainder to the largest line so the total ties out", () => {
    // 10,00 over three equal lines is 3,33 each — one kuruş short.
    const out = allocateProRata(
      [line("a", "100.00"), line("b", "100.00"), line("c", "100.00")],
      D(10),
    );
    const total = [...out.values()].reduce((s, v) => s.add(v), D(0));
    expect(total.toFixed(2)).toBe("10.00");
    expect(out.get("a")!.toFixed(2)).toBe("3.34"); // first of the equals wins the kuruş
  });

  it("gives nothing away when there is nothing to give", () => {
    expect(allocateProRata([line("a", "0.00")], D(50)).size).toBe(0);
    expect(allocateProRata([line("a", "100.00")], D(0)).size).toBe(0);
  });
});

describe("registry validation", () => {
  it("rejects an unknown rule type", () => {
    expect(() => compileCondition({ type: "RM_RF", params: {} })).toThrowError(
      BusinessError,
    );
    expect(() => compileAction({ type: "GIVE_EVERYTHING", params: {} })).toThrowError(
      /Tanımsız aksiyon/,
    );
  });

  it("rejects parameters that fail the rule's own schema", () => {
    expect(() =>
      compileAction({ type: "PERCENT_OFF", params: { percent: 150 } }),
    ).toThrowError(BusinessError);
    expect(() =>
      compileAction({ type: "PERCENT_OFF", params: { percent: "10" } }),
    ).toThrowError(BusinessError);
    expect(() =>
      compileCondition({ type: "MIN_ORDER_SUBTOTAL", params: {} }),
    ).toThrowError(BusinessError);
  });

  it("rejects a rule that is not even shaped like one", () => {
    expect(() => compileCondition("MIN_ORDER_SUBTOTAL")).toThrowError(BusinessError);
    expect(() => compileCondition(null)).toThrowError(BusinessError);
  });
});

describe("condition mode", () => {
  const wrongGroup = {
    type: "CUSTOMER_GROUP_IN",
    params: { customerGroupIds: ["group-9"] },
  };
  const rightCompany = { type: "COMPANY_IN", params: { companyIds: ["company-1"] } };
  const tenPercent = { type: "PERCENT_OFF", params: { percent: 10 } };

  it("requires every condition by default", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      promotions: [promo("p1", [wrongGroup, rightCompany], [tenPercent])],
    });
    expect(result.total.toFixed(2)).toBe("0.00");
  });

  it("takes one match when the promotion says ANY", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      promotions: [
        promo("p1", [wrongGroup, rightCompany], [tenPercent], {
          conditionMode: "ANY",
        }),
      ],
    });
    expect(result.total.toFixed(2)).toBe("100.00");
  });

  it("still applies with no conditions at all, in either mode", () => {
    for (const mode of ["ALL", "ANY"] as const) {
      const result = applyPromotions({
        lines: [line("a", "1000.00")],
        context: CONTEXT,
        promotions: [promo("p1", [], [tenPercent], { conditionMode: mode })],
      });
      expect(result.total.toFixed(2)).toBe("100.00");
    }
  });
});

describe("shipping campaigns", () => {
  it("takes a percentage off the freight and nothing off the goods", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      shippingFee: D("200.00"),
      promotions: [
        promo("p1", [], [{ type: "SHIPPING_PERCENT_OFF", params: { percent: 50 } }]),
      ],
    });
    expect(result.shippingDiscount.toFixed(2)).toBe("100.00");
    expect(result.perLine.size).toBe(0);
    // `total` is the goods discount only — the freight is discounted at source,
    // so adding it here would take it off the order a second time.
    expect(result.total.toFixed(2)).toBe("0.00");
    // The campaign is still credited with everything it gave.
    expect(result.applied[0]!.amount.toFixed(2)).toBe("100.00");
  });

  it("wipes the freight and never more than it", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      shippingFee: D("75.50"),
      promotions: [promo("p1", [], [{ type: "FREE_SHIPPING", params: {} }])],
    });
    expect(result.shippingDiscount.toFixed(2)).toBe("75.50");
  });

  it("does not count as applied when there is no freight to discount", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      promotions: [promo("p1", [], [{ type: "FREE_SHIPPING", params: {} }])],
    });
    expect(result.applied).toHaveLength(0);
    expect(result.shippingDiscount.toFixed(2)).toBe("0.00");
  });

  it("lets a second campaign only take what the first one left", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      shippingFee: D("100.00"),
      promotions: [
        promo("p1", [], [{ type: "SHIPPING_PERCENT_OFF", params: { percent: 60 } }], {
          priority: 1,
        }),
        promo("p2", [], [{ type: "FREE_SHIPPING", params: {} }], { priority: 2 }),
      ],
    });
    expect(result.shippingDiscount.toFixed(2)).toBe("100.00");
    expect(result.applied.map((a) => a.amount.toFixed(2))).toEqual(["60.00", "40.00"]);
  });
});

describe("gift items", () => {
  const gift = (params: Record<string, unknown>) => ({ type: "GIFT_ITEM", params });

  it("reports the grant instead of pricing it", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00")],
      context: CONTEXT,
      promotions: [promo("p1", [], [gift({ variantId: "v-gift", quantity: 2 })])],
    });
    expect(result.gifts).toEqual([
      { promotionId: "p1", variantId: "v-gift", quantity: 2 },
    ]);
    // Value is unknown here: the quote prices it against the catalogue.
    expect(result.total.toFixed(2)).toBe("0.00");
    expect(result.applied).toHaveLength(1);
  });

  it("repeats once per N bought, and stops at the cap", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00", { quantity: 47 })],
      context: CONTEXT,
      promotions: [
        promo("p1", [], [gift({ variantId: "v-gift", quantity: 1, perMatch: 10 })]),
        promo(
          "p2",
          [],
          [gift({ variantId: "v-gift", quantity: 1, perMatch: 10, maxQuantity: 3 })],
          { priority: 1 },
        ),
      ],
    });
    expect(result.gifts[0]!.quantity).toBe(4); // floor(47 / 10)
    expect(result.gifts[1]!.quantity).toBe(3); // capped
  });

  it("grants nothing when the cart has not reached the threshold", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00", { quantity: 5 })],
      context: CONTEXT,
      promotions: [
        promo("p1", [], [gift({ variantId: "v-gift", quantity: 1, perMatch: 10 })]),
      ],
    });
    expect(result.gifts).toHaveLength(0);
    expect(result.applied).toHaveLength(0);
  });

  it("counts only the targeted lines when deciding how many to give", () => {
    const result = applyPromotions({
      lines: [
        line("a", "500.00", { quantity: 20, categoryId: "cat-promo" }),
        line("b", "500.00", { quantity: 40, categoryId: "cat-other" }),
      ],
      context: CONTEXT,
      promotions: [
        promo(
          "p1",
          [],
          [
            gift({
              variantId: "v-gift",
              quantity: 1,
              perMatch: 10,
              categoryIds: ["cat-promo"],
            }),
          ],
        ),
      ],
    });
    expect(result.gifts[0]!.quantity).toBe(2);
  });
});

describe("quantity ladders", () => {
  const giftLadder = (tiers: unknown, extra: Record<string, unknown> = {}) => ({
    type: "GIFT_TIER",
    params: { variantId: "v-gift", tiers, ...extra },
  });
  const percentLadder = (tiers: unknown, extra: Record<string, unknown> = {}) => ({
    type: "PERCENT_OFF_TIER",
    params: { tiers, ...extra },
  });
  const LADDER = [
    { minQuantity: 10, value: 1 },
    { minQuantity: 50, value: 6 },
  ];

  it("gives the highest rung reached, not the sum of the rungs", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00", { quantity: 50 })],
      context: CONTEXT,
      promotions: [promo("p1", [], [giftLadder(LADDER)])],
    });
    // 1 + 6 would be stacking, 5 would be "one per ten": the point of the rung
    // is that it pays better than the rate below it.
    expect(result.gifts).toEqual([
      { promotionId: "p1", variantId: "v-gift", quantity: 6 },
    ]);
  });

  it("stays on the rung until the next one is reached", () => {
    const at = (quantity: number) =>
      applyPromotions({
        lines: [line("a", "1000.00", { quantity })],
        context: CONTEXT,
        promotions: [promo("p1", [], [giftLadder(LADDER)])],
      }).gifts[0]?.quantity ?? 0;

    expect(at(9)).toBe(0);
    expect(at(10)).toBe(1);
    expect(at(49)).toBe(1);
    expect(at(50)).toBe(6);
    // Above the top rung the ladder stops; repeating is what perMatch is for.
    expect(at(500)).toBe(6);
  });

  it("reads the rungs in whatever order they were stored", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00", { quantity: 50 })],
      context: CONTEXT,
      promotions: [
        promo("p1", [], [giftLadder([...LADDER].reverse())]),
      ],
    });
    expect(result.gifts[0]!.quantity).toBe(6);
  });

  it("counts only the targeted lines but discounts all of them", () => {
    const result = applyPromotions({
      lines: [
        line("a", "1000.00", { quantity: 30, categoryId: "cat-promo" }),
        line("b", "1000.00", { quantity: 40, categoryId: "cat-other" }),
      ],
      context: CONTEXT,
      promotions: [
        promo(
          "p1",
          [],
          [
            percentLadder(
              [
                { minQuantity: 10, value: 5 },
                { minQuantity: 50, value: 10 },
              ],
              { categoryIds: ["cat-promo"] },
            ),
          ],
        ),
      ],
    });
    // 30 units in the targeted category: the 50 rung is not reached even though
    // the cart holds 70 items in total.
    expect(result.perLine.get("a")!.toFixed(2)).toBe("50.00");
    expect(result.perLine.has("b")).toBe(false);
  });

  it("gives nothing at all below the first rung", () => {
    const result = applyPromotions({
      lines: [line("a", "1000.00", { quantity: 5 })],
      context: CONTEXT,
      promotions: [promo("p1", [], [percentLadder(LADDER)])],
    });
    expect(result.total.toFixed(2)).toBe("0.00");
    expect(result.applied).toHaveLength(0);
  });

  it("refuses a ladder that pays less the higher you climb", () => {
    expect(() =>
      compileAction(
        giftLadder([
          { minQuantity: 10, value: 6 },
          { minQuantity: 50, value: 1 },
        ]),
      ),
    ).toThrowError(/az veriyor/i);
  });

  it("refuses two rungs starting at the same quantity", () => {
    expect(() =>
      compileAction(
        giftLadder([
          { minQuantity: 10, value: 1 },
          { minQuantity: 10, value: 2 },
        ]),
      ),
    ).toThrowError(/aynı adetten/i);
  });

  it("refuses an empty ladder and a fractional gift count", () => {
    expect(() => compileAction(giftLadder([]))).toThrowError(BusinessError);
    expect(() =>
      compileAction(giftLadder([{ minQuantity: 10, value: 1.5 }])),
    ).toThrowError(BusinessError);
  });
});
