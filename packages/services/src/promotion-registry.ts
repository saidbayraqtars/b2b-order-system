import { z } from "zod";
import type {
  PromotionRuleCatalog,
  RuleMeta,
  RuleParamMeta,
} from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, ZERO, round2 } from "./money";
import type { Money } from "./money";

/**
 * The catalogue of things a campaign may test and a campaign may do.
 *
 * A stored promotion is data: `[{ type, params }]`. This file is the only place
 * that turns such a row into behaviour, which makes it the security boundary of
 * the promotion engine — exactly like the dataset registry is for the report
 * builder. A rule type that is not defined here does not exist, and every
 * parameter goes through the Zod schema declared next to the rule before any
 * code touches it. Nothing arriving from a client (or from a row someone edited
 * straight in the database) is ever evaluated as code, as a Prisma path, or as
 * an amount that was not parsed as a number.
 *
 * Adding a campaign type means adding one entry here — the admin builder and the
 * order pipeline pick it up automatically from `promotionRuleCatalog()`.
 */

// ─────────────────────────────────────────────
// EVALUATION INPUT
// ─────────────────────────────────────────────

/** One cart line as the engine sees it. Amounts are net of the company discount. */
export interface EngineLine {
  /** Stable identity of the line — the variant id. */
  key: string;
  productId: string;
  categoryId: string;
  quantity: number;
  /** Line net *right now*: what earlier promotions have left of it. */
  net: Money;
}

/** Everything a condition may look at besides the lines themselves. */
export interface EngineContext {
  companyId: string;
  customerGroupId: string | null;
  paymentMethod: "OPEN_ACCOUNT" | "CREDIT_CARD";
  /** Orders the company has placed before this one (rejected/cancelled excluded). */
  previousOrderCount: number;
  now: Date;
}

export interface EngineState {
  lines: EngineLine[];
  context: EngineContext;
}

// ─────────────────────────────────────────────
// SHARED PARAMETER PIECES
// ─────────────────────────────────────────────

const idList = z.array(z.string().min(1).max(60)).max(200);

/** Product/category filter shared by the item-scoped rules. */
const targetSchema = {
  categoryIds: idList.optional(),
  productIds: idList.optional(),
};

interface TargetParams {
  categoryIds?: string[];
  productIds?: string[];
}

const TARGET_META: RuleParamMeta[] = [
  {
    key: "categoryIds",
    label: "Kategoriler",
    kind: "categoryIds",
    required: false,
    hint: "Boş bırakılırsa tüm kategoriler",
  },
  {
    key: "productIds",
    label: "Ürünler",
    kind: "productIds",
    required: false,
    hint: "Boş bırakılırsa tüm ürünler",
  },
];

/**
 * Lines a targeted rule applies to. An empty filter means "the whole cart";
 * giving both lists means "in these categories OR these products".
 */
function matchLines(lines: EngineLine[], target: TargetParams): EngineLine[] {
  const cats = target.categoryIds ?? [];
  const prods = target.productIds ?? [];
  if (cats.length === 0 && prods.length === 0) return lines;
  return lines.filter(
    (l) => cats.includes(l.categoryId) || prods.includes(l.productId),
  );
}

// ─────────────────────────────────────────────
// RULE DEFINITION SHAPES
// ─────────────────────────────────────────────

interface ConditionDef<P> {
  type: string;
  label: string;
  description: string;
  schema: z.ZodType<P>;
  params: RuleParamMeta[];
  check: (params: P, state: EngineState) => boolean;
}

/** What an action gives back: how much to take off each line, keyed by line. */
export type Allocation = Map<string, Money>;

interface ActionDef<P> {
  type: string;
  label: string;
  description: string;
  schema: z.ZodType<P>;
  params: RuleParamMeta[];
  /** Never returns more than a line's current net — the engine clamps again anyway. */
  discount: (params: P, state: EngineState) => Allocation;
}

function sumNet(lines: EngineLine[]): Money {
  return lines.reduce<Money>((acc, l) => acc.add(l.net), ZERO);
}

// ─────────────────────────────────────────────
// CONDITIONS
// ─────────────────────────────────────────────

const MIN_ORDER_SUBTOTAL: ConditionDef<{ amount: number }> = {
  type: "MIN_ORDER_SUBTOTAL",
  label: "Sepet tutarı en az",
  description:
    "Sepetin (iskontolar sonrası, KDV hariç) net toplamı verilen tutara ulaşmışsa geçerli.",
  schema: z.object({ amount: z.number().positive().max(100_000_000) }),
  params: [{ key: "amount", label: "Tutar (₺)", kind: "money", required: true }],
  check: (p, s) => sumNet(s.lines).gte(new Dec(p.amount)),
};

const MIN_ITEM_QUANTITY: ConditionDef<{ quantity: number } & TargetParams> = {
  type: "MIN_ITEM_QUANTITY",
  label: "Ürün adedi en az",
  description:
    "Seçilen kategori/ürünlerden sepette en az bu kadar adet varsa geçerli.",
  schema: z.object({
    quantity: z.number().int().positive().max(1_000_000),
    ...targetSchema,
  }),
  params: [
    { key: "quantity", label: "Adet", kind: "quantity", required: true },
    ...TARGET_META,
  ],
  check: (p, s) => {
    const total = matchLines(s.lines, p).reduce((n, l) => n + l.quantity, 0);
    return total >= p.quantity;
  },
};

const CUSTOMER_GROUP_IN: ConditionDef<{ customerGroupIds: string[] }> = {
  type: "CUSTOMER_GROUP_IN",
  label: "Müşteri grubu",
  description: "Yalnızca seçilen müşteri gruplarındaki firmalar için geçerli.",
  schema: z.object({ customerGroupIds: idList.min(1) }),
  params: [
    {
      key: "customerGroupIds",
      label: "Gruplar",
      kind: "customerGroupIds",
      required: true,
    },
  ],
  check: (p, s) =>
    s.context.customerGroupId !== null &&
    p.customerGroupIds.includes(s.context.customerGroupId),
};

const COMPANY_IN: ConditionDef<{ companyIds: string[] }> = {
  type: "COMPANY_IN",
  label: "Belirli firmalar",
  description: "Yalnızca seçilen firmalar için geçerli.",
  schema: z.object({ companyIds: idList.min(1) }),
  params: [
    { key: "companyIds", label: "Firmalar", kind: "companyIds", required: true },
  ],
  check: (p, s) => p.companyIds.includes(s.context.companyId),
};

const PAYMENT_METHOD_IS: ConditionDef<{
  paymentMethod: "OPEN_ACCOUNT" | "CREDIT_CARD";
}> = {
  type: "PAYMENT_METHOD_IS",
  label: "Ödeme yöntemi",
  description: "Sipariş bu ödeme yöntemiyle veriliyorsa geçerli.",
  schema: z.object({
    paymentMethod: z.enum(["OPEN_ACCOUNT", "CREDIT_CARD"]),
  }),
  params: [
    {
      key: "paymentMethod",
      label: "Yöntem",
      kind: "paymentMethod",
      required: true,
    },
  ],
  check: (p, s) => s.context.paymentMethod === p.paymentMethod,
};

/** Takes no parameters — the record schema simply accepts the empty object. */
const FIRST_ORDER: ConditionDef<Record<string, unknown>> = {
  type: "FIRST_ORDER",
  label: "İlk sipariş",
  description:
    "Firmanın ilk siparişiyse geçerli (iptal ve reddedilen siparişler sayılmaz).",
  schema: z.record(z.unknown()),
  params: [],
  check: (_p, s) => s.context.previousOrderCount === 0,
};

// ─────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────

const PERCENT_OFF: ActionDef<{ percent: number } & TargetParams> = {
  type: "PERCENT_OFF",
  label: "Yüzde indirim",
  description:
    "Eşleşen satırların o anki net tutarından yüzde indirim yapar (KDV öncesi).",
  schema: z.object({
    percent: z.number().positive().max(100),
    ...targetSchema,
  }),
  params: [
    { key: "percent", label: "Oran (%)", kind: "percent", required: true },
    ...TARGET_META,
  ],
  discount: (p, s) => {
    const out: Allocation = new Map();
    for (const line of matchLines(s.lines, p)) {
      const amount = round2(line.net.mul(p.percent).div(100));
      if (amount.gt(ZERO)) out.set(line.key, amount);
    }
    return out;
  },
};

const FIXED_OFF_UNIT: ActionDef<{ amount: number } & TargetParams> = {
  type: "FIXED_OFF_UNIT",
  label: "Adet başına tutar indirimi",
  description: "Eşleşen satırlarda her bir adet için sabit tutar düşer.",
  schema: z.object({
    amount: z.number().positive().max(1_000_000),
    ...targetSchema,
  }),
  params: [
    { key: "amount", label: "Adet başına (₺)", kind: "money", required: true },
    ...TARGET_META,
  ],
  discount: (p, s) => {
    const out: Allocation = new Map();
    const per = new Dec(p.amount);
    for (const line of matchLines(s.lines, p)) {
      const wanted = round2(per.mul(line.quantity));
      const amount = wanted.gt(line.net) ? line.net : wanted;
      if (amount.gt(ZERO)) out.set(line.key, amount);
    }
    return out;
  },
};

const FIXED_OFF_ORDER: ActionDef<{ amount: number } & TargetParams> = {
  type: "FIXED_OFF_ORDER",
  label: "Sepetten sabit tutar",
  description:
    "Sabit tutarı eşleşen satırlara net tutarları oranında dağıtır; sepetten fazlasını düşmez.",
  schema: z.object({
    amount: z.number().positive().max(10_000_000),
    ...targetSchema,
  }),
  params: [
    { key: "amount", label: "Tutar (₺)", kind: "money", required: true },
    ...TARGET_META,
  ],
  discount: (p, s) => {
    const lines = matchLines(s.lines, p).filter((l) => l.net.gt(ZERO));
    const total = sumNet(lines);
    if (total.lte(ZERO)) return new Map();

    // Never give away more than the matched lines are worth.
    const wanted = new Dec(p.amount);
    const budget = wanted.gt(total) ? total : wanted;

    return allocateProRata(lines, budget);
  },
};

/**
 * Split `budget` over `lines` in proportion to their net, then hand the rounding
 * remainder to the largest line. Without that last step a 10,00 ₺ discount split
 * over three lines would come to 9,99 ₺ and the order total would not tie out.
 */
export function allocateProRata(lines: EngineLine[], budget: Money): Allocation {
  const out: Allocation = new Map();
  const total = sumNet(lines);
  if (total.lte(ZERO) || budget.lte(ZERO)) return out;

  let assigned = ZERO;
  let largest: EngineLine | null = null;
  for (const line of lines) {
    if (largest === null || line.net.gt(largest.net)) largest = line;
    const share = round2(budget.mul(line.net).div(total));
    out.set(line.key, share);
    assigned = assigned.add(share);
  }

  const remainder = budget.sub(assigned);
  if (!remainder.isZero() && largest) {
    const fixed = (out.get(largest.key) ?? ZERO).add(remainder);
    // The correction can only push a line above its own net if rounding went up.
    out.set(largest.key, fixed.gt(largest.net) ? largest.net : fixed);
  }

  for (const [key, value] of out) {
    if (value.lte(ZERO)) out.delete(key);
  }
  return out;
}

// ─────────────────────────────────────────────
// REGISTRY
// ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the map is heterogeneous by design; access goes through the checked helpers below.
const CONDITIONS = new Map<string, ConditionDef<any>>(
  [
    MIN_ORDER_SUBTOTAL,
    MIN_ITEM_QUANTITY,
    CUSTOMER_GROUP_IN,
    COMPANY_IN,
    PAYMENT_METHOD_IS,
    FIRST_ORDER,
  ].map((d) => [d.type, d]),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above.
const ACTIONS = new Map<string, ActionDef<any>>(
  [PERCENT_OFF, FIXED_OFF_UNIT, FIXED_OFF_ORDER].map((d) => [d.type, d]),
);

/** A rule that passed registry validation: known type, parsed params. */
export interface CompiledCondition {
  type: string;
  params: unknown;
  check: (state: EngineState) => boolean;
}

export interface CompiledAction {
  type: string;
  params: unknown;
  discount: (state: EngineState) => Allocation;
}

function ruleParts(raw: unknown): { type: string; params: unknown } {
  if (typeof raw !== "object" || raw === null || !("type" in raw)) {
    throw new BusinessError("INVALID_PROMOTION", "Kural biçimi geçersiz");
  }
  const { type, params } = raw as { type: unknown; params?: unknown };
  if (typeof type !== "string") {
    throw new BusinessError("INVALID_PROMOTION", "Kural türü geçersiz");
  }
  return { type, params: params ?? {} };
}

/** Validate + bind one stored condition. Throws INVALID_PROMOTION if unknown. */
export function compileCondition(raw: unknown): CompiledCondition {
  const { type, params } = ruleParts(raw);
  const def = CONDITIONS.get(type);
  if (!def) {
    throw new BusinessError(
      "INVALID_PROMOTION",
      `Tanımsız koşul: ${type}`,
      { type },
    );
  }
  const parsed = def.schema.safeParse(params);
  if (!parsed.success) {
    throw new BusinessError(
      "INVALID_PROMOTION",
      `${def.label}: ${parsed.error.issues[0]?.message ?? "geçersiz parametre"}`,
      { type },
    );
  }
  return {
    type,
    params: parsed.data,
    check: (state) => def.check(parsed.data, state),
  };
}

/** Validate + bind one stored action. Throws INVALID_PROMOTION if unknown. */
export function compileAction(raw: unknown): CompiledAction {
  const { type, params } = ruleParts(raw);
  const def = ACTIONS.get(type);
  if (!def) {
    throw new BusinessError("INVALID_PROMOTION", `Tanımsız aksiyon: ${type}`, {
      type,
    });
  }
  const parsed = def.schema.safeParse(params);
  if (!parsed.success) {
    throw new BusinessError(
      "INVALID_PROMOTION",
      `${def.label}: ${parsed.error.issues[0]?.message ?? "geçersiz parametre"}`,
      { type },
    );
  }
  return {
    type,
    params: parsed.data,
    discount: (state) => def.discount(parsed.data, state),
  };
}

function toMeta(def: { type: string; label: string; description: string; params: RuleParamMeta[] }): RuleMeta {
  return {
    type: def.type,
    label: def.label,
    description: def.description,
    params: def.params,
  };
}

/** Rule catalogue for the admin builder — labels and parameter kinds only. */
export function promotionRuleCatalog(): PromotionRuleCatalog {
  return {
    conditions: [...CONDITIONS.values()].map(toMeta),
    actions: [...ACTIONS.values()].map(toMeta),
  };
}
