"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CUSTOM_CODE_KEYS,
  type CustomCodeEntity,
  type CustomCodeFieldView,
  type CustomCodeKey,
  type CustomCodeValues,
} from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { Label, Select, TextInput } from "@/components/form";

// Özel kodların ekran parçaları: form alanları, liste süzgeci, kısa özet.
//
// Tanım tek uçtan okunuyor (`/api/admin/custom-codes`) ve üç parça aynı
// önbelleği paylaşıyor; ürün formu ile ürün listesi aynı sayfada açıldığında
// tek istek gidiyor.

export type CustomCodeForm = Record<CustomCodeKey, string>;

export const EMPTY_CUSTOM_CODES: CustomCodeForm = Object.fromEntries(
  CUSTOM_CODE_KEYS.map((k) => [k, ""]),
) as CustomCodeForm;

/** Sunucudan gelen değerler → form durumu (null → ""). */
export function customCodeForm(values?: CustomCodeValues | null): CustomCodeForm {
  if (!values) return { ...EMPTY_CUSTOM_CODES };
  return Object.fromEntries(
    CUSTOM_CODE_KEYS.map((k) => [k, values[k] ?? ""]),
  ) as CustomCodeForm;
}

/**
 * Form durumu → istek gövdesi. Yalnızca **aktif** yuvalar gönderiliyor: pasif
 * bir yuvanın değeri ekranda yok, göndermek onu boş diye silerdi.
 */
export function customCodePayload(
  form: CustomCodeForm,
  fields: readonly CustomCodeFieldView[],
): Partial<Record<CustomCodeKey, string | null>> {
  const out: Partial<Record<CustomCodeKey, string | null>> = {};
  for (const f of fields) {
    if (!f.isActive) continue;
    out[f.key] = form[f.key].trim() || null;
  }
  return out;
}

interface FieldsResponse {
  fields: Record<CustomCodeEntity, CustomCodeFieldView[]>;
}

export function useCustomCodeFields(entity: CustomCodeEntity) {
  const query = useQuery({
    queryKey: ["admin", "custom-codes"],
    queryFn: () => apiGet<FieldsResponse>("/api/admin/custom-codes"),
    staleTime: 60_000,
  });
  const all = query.data?.fields[entity] ?? [];
  return { query, all, active: all.filter((f) => f.isActive) };
}

/**
 * Ürün/firma formunun özel kod alanları. Aktif yuva yoksa hiçbir şey
 * çizilmiyor — özel kod kullanmayan bir kurulumun formunda boş bir başlık
 * durmamalı.
 */
export function CustomCodeInputs({
  entity,
  value,
  onChange,
}: {
  entity: CustomCodeEntity;
  value: CustomCodeForm;
  onChange: (next: CustomCodeForm) => void;
}) {
  const { active } = useCustomCodeFields(entity);
  if (active.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {active.map((f) => (
        <div key={f.key}>
          <Label htmlFor={`kod-${entity}-${f.slot}`}>{f.label}</Label>
          {f.options.length > 0 ? (
            <Select
              id={`kod-${entity}-${f.slot}`}
              value={value[f.key]}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            >
              <option value="">—</option>
              {/* Listede olmayan eski bir değer kaybolmasın: seçili kalsın,
                  kullanıcı değiştirene kadar aynen yazılsın. */}
              {value[f.key] && !f.options.includes(value[f.key]) && (
                <option value={value[f.key]}>{value[f.key]} (listede yok)</option>
              )}
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <TextInput
              id={`kod-${entity}-${f.slot}`}
              value={value[f.key]}
              maxLength={100}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Adresteki süzgeç anahtarları: `kod1`…`kod10`. */
export type CodeFilterState = Record<`kod${number}`, string>;

export const CODE_FILTER_DEFAULTS = Object.fromEntries(
  CUSTOM_CODE_KEYS.map((_, i) => [`kod${i + 1}`, ""]),
) as CodeFilterState;

/** Süzgeç durumu → API sorgu parametreleri (anahtarlar aynı: `kodN`). */
export function appendCodeFilters(params: URLSearchParams, state: CodeFilterState): void {
  for (const [k, v] of Object.entries(state)) {
    if (k.startsWith("kod") && v) params.set(k, v);
  }
}

/**
 * Liste ekranının özel kod süzgeçleri. Seçenek listesi olan yuva açılır liste,
 * olmayan yuva Enter'la uygulanan metin kutusu.
 */
export function CustomCodeFilters({
  entity,
  value,
  onChange,
}: {
  entity: CustomCodeEntity;
  value: CodeFilterState;
  onChange: (key: `kod${number}`, next: string) => void;
}) {
  const { active } = useCustomCodeFields(entity);
  return (
    <>
      {active.map((f) => {
        const key = `kod${f.slot}` as const;
        return f.options.length > 0 ? (
          <Select
            key={key}
            aria-label={f.label}
            value={value[key] ?? ""}
            onChange={(e) => onChange(key, e.target.value)}
            className="w-44"
          >
            <option value="">{f.label}: hepsi</option>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        ) : (
          <CodeTextFilter
            key={key}
            label={f.label}
            value={value[key] ?? ""}
            onApply={(next) => onChange(key, next)}
          />
        );
      })}
    </>
  );
}

function CodeTextFilter({
  label,
  value,
  onApply,
}: {
  label: string;
  value: string;
  onApply: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <TextInput
      aria-label={label}
      placeholder={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onApply(draft.trim());
      }}
      onBlur={() => {
        if (draft.trim() !== value) onApply(draft.trim());
      }}
      className="w-40"
    />
  );
}

/** Listede tek satırlık künye: "Bölge: Ege · Segment: Bayi". */
export function CustomCodeSummary({
  entity,
  codes,
}: {
  entity: CustomCodeEntity;
  codes: CustomCodeValues;
}) {
  const { active } = useCustomCodeFields(entity);
  const parts = active
    .filter((f) => codes[f.key])
    .map((f) => `${f.label}: ${codes[f.key]}`);
  if (parts.length === 0) return null;
  return <span className="text-xs text-ink-faint">{parts.join(" · ")}</span>;
}
