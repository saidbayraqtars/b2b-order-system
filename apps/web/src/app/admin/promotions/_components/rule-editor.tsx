"use client";

import type { PromotionRuleInput, RuleMeta, RuleParamMeta } from "@repo/types";
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
          <option value="OPEN_ACCOUNT">Açık hesap (cari)</option>
          <option value="CREDIT_CARD">Kredi kartı</option>
        </Select>
      </label>
    );
  }

  // money / percent / quantity — all numeric, only the step differs.
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
