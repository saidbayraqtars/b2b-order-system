"use client";

import {
  PAYMENT_METHOD_LABELS,
  PaymentMethodEnum,
  type PromotionRuleInput,
  type RuleMeta,
  type RuleParamMeta,
} from "@repo/types";
import { Button, Label, Select, TextInput } from "@/components/form";

// The builder does not know the rule catalogue: it renders whatever
// /api/admin/promotions/rules describes. Adding a condition or an action on the
// server therefore shows up here on its own, and this file never has to decide
// what a rule means — it only collects parameters of the kind the registry asked
// for.

export interface RuleOptions {
  categories: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  customerGroups: Array<{ id: string; name: string }>;
  companies: Array<{ id: string; name: string }>;
  /** Individual variants — what a gift action points at. */
  variants: Array<{ id: string; name: string }>;
}

const OPTION_SOURCE: Partial<Record<RuleParamMeta["kind"], keyof RuleOptions>> = {
  categoryIds: "categories",
  productIds: "products",
  customerGroupIds: "customerGroups",
  companyIds: "companies",
};

export function RuleList({
  title,
  emptyHint,
  catalog,
  options,
  rules,
  onChange,
}: {
  title: string;
  emptyHint: string;
  catalog: RuleMeta[];
  options: RuleOptions;
  rules: PromotionRuleInput[];
  onChange: (next: PromotionRuleInput[]) => void;
}) {
  const add = (type: string) => {
    if (!type) return;
    onChange([...rules, { type, params: {} }]);
  };
  const update = (index: number, params: Record<string, unknown>) =>
    onChange(rules.map((r, i) => (i === index ? { ...r, params } : r)));
  const remove = (index: number) =>
    onChange(rules.filter((_, i) => i !== index));

  return (
    <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Select
          value=""
          className="w-56"
          onChange={(e) => add(e.target.value)}
          aria-label={`${title} ekle`}
        >
          <option value="">+ Ekle…</option>
          {catalog.map((c) => (
            <option key={c.type} value={c.type}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-neutral-500">{emptyHint}</p>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule, index) => {
            const meta = catalog.find((c) => c.type === rule.type);
            return (
              <li
                key={`${rule.type}-${index}`}
                className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {meta?.label ?? rule.type}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {meta?.description ?? "Bu kural artık tanımlı değil."}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => remove(index)}>
                    Kaldır
                  </Button>
                </div>

                {meta && meta.params.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {meta.params.map((param) => (
                      <ParamField
                        key={param.key}
                        param={param}
                        options={options}
                        value={rule.params?.[param.key]}
                        onChange={(value) =>
                          update(index, { ...rule.params, [param.key]: value })
                        }
                      />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ParamField({
  param,
  options,
  value,
  onChange,
}: {
  param: RuleParamMeta;
  options: RuleOptions;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const source = OPTION_SOURCE[param.kind];

  if (source) {
    const list = options[source];
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <label className="block">
        <Label hint={param.hint}>{param.label}</Label>
        <select
          multiple
          size={Math.min(6, Math.max(3, list.length))}
          value={selected}
          onChange={(e) =>
            onChange(
              [...e.target.selectedOptions].map((o) => o.value).filter(Boolean),
            )
          }
          className="w-64 rounded-md border border-neutral-300 bg-white p-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (param.kind === "variantId") {
    return (
      <label className="block">
        <Label hint={param.hint}>{param.label}</Label>
        <Select
          className="w-72"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">Seçin…</option>
          {options.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </label>
    );
  }

  if (param.kind === "giftTiers" || param.kind === "percentTiers") {
    return (
      <TierField
        param={param}
        gift={param.kind === "giftTiers"}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (param.kind === "paymentMethod") {
    return (
      <label className="block">
        <Label hint={param.hint}>{param.label}</Label>
        <Select
          className="w-44"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">Seçin…</option>
          {/* Driven by the enum: this list was written when there were two
              methods and never grew, so a campaign could not be aimed at çek,
              nakit or havale even though the engine accepts them. */}
          {PaymentMethodEnum.options.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </Select>
      </label>
    );
  }

  // money / percent / quantity — all numeric, only the step differs.
  // (Ladders are handled above; see TierField.)
  const step = param.kind === "quantity" ? 1 : 0.01;
  return (
    <label className="block">
      <Label hint={param.hint}>{param.label}</Label>
      <TextInput
        type="number"
        min={0}
        step={step}
        className="w-36"
        value={typeof value === "number" ? String(value) : ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? undefined : Number(raw));
        }}
      />
    </label>
  );
}

/** A ladder row while it is being typed: either cell may still be empty. */
interface TierRow {
  minQuantity?: number;
  value?: number;
}

/**
 * The quantity ladder control ("10 adet → 1 hediye, 50 adet → 6 hediye").
 *
 * Rows keep the order they were added in and are not sorted while typing —
 * re-ordering the list under the cursor is how you make someone edit the wrong
 * row. The server sorts before it evaluates, so the stored order does not
 * matter; what does matter is that the ladder never pays less higher up, and
 * that rule is checked here as well as on the server so the mistake is visible
 * before the campaign is saved rather than as a validation error afterwards.
 */
function TierField({
  param,
  gift,
  value,
  onChange,
}: {
  param: RuleParamMeta;
  gift: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const rows: TierRow[] = Array.isArray(value) ? (value as TierRow[]) : [];

  const update = (index: number, patch: TierRow) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) =>
    onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, {}]);

  const num = (raw: string) => (raw === "" ? undefined : Number(raw));
  const warning = ladderWarning(rows);

  return (
    <div className="block w-full">
      <Label hint={param.hint}>{param.label}</Label>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          // Rows have no identity of their own; position is what identifies them.
          <li key={index} className="flex items-end gap-2">
            <label className="block">
              <span className="text-xs text-neutral-500">Adet en az</span>
              <TextInput
                type="number"
                min={1}
                step={1}
                size="sm"
                className="w-28"
                value={row.minQuantity === undefined ? "" : String(row.minQuantity)}
                onChange={(e) =>
                  update(index, { minQuantity: num(e.target.value) })
                }
              />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-500">
                {gift ? "Hediye adedi" : "Oran (%)"}
              </span>
              <TextInput
                type="number"
                min={gift ? 1 : 0}
                max={gift ? undefined : 100}
                step={gift ? 1 : 0.01}
                size="sm"
                className="w-28"
                value={row.value === undefined ? "" : String(row.value)}
                onChange={(e) => update(index, { value: num(e.target.value) })}
              />
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => remove(index)}
              aria-label={`${index + 1}. kademeyi kaldır`}
            >
              Kaldır
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={add}>
          + Kademe
        </Button>
        {warning && (
          <span className="text-xs text-amber-600 dark:text-amber-500">
            {warning}
          </span>
        )}
      </div>
    </div>
  );
}

/** Mirrors the server's ladder rules; returns the first problem or null. */
function ladderWarning(rows: TierRow[]): string | null {
  if (rows.length === 0) return "En az bir kademe girin";
  if (rows.some((r) => r.minQuantity === undefined || r.value === undefined)) {
    return "Boş kademe var";
  }

  const sorted = [...rows].sort((a, b) => a.minQuantity! - b.minQuantity!);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.minQuantity === prev.minQuantity) {
      return `Aynı adetten iki kademe var (${cur.minQuantity})`;
    }
    if (cur.value! < prev.value!) {
      return `Üst kademe alt kademeden az veriyor (${cur.minQuantity} adet)`;
    }
  }
  return null;
}
