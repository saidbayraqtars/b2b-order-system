"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { PromotionRow } from "@repo/services";
import type { PromotionRuleCatalog, PromotionRuleInput } from "@repo/types";
import { apiPatch, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, TextArea, TextInput } from "@/components/form";
import { RuleList, type RuleOptions } from "./rule-editor";

// One campaign, edited as a whole: the header fields, then the conditions that
// must hold and the actions that discount. Saving sends the complete definition,
// and the server compiles every rule before it stores anything — an unsavable
// campaign is one that could not have been evaluated either.

/** <input type="datetime-local"> speaks local time without a zone; the API speaks ISO. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function PromotionForm({
  initial,
  catalog,
  options,
  onSaved,
  onCancel,
}: {
  initial: PromotionRow | null;
  catalog: PromotionRuleCatalog;
  options: RuleOptions;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? null));
  const [priority, setPriority] = useState(String(initial?.priority ?? 0));
  const [stopFurther, setStopFurther] = useState(initial?.stopFurther ?? false);
  const [usageLimit, setUsageLimit] = useState(
    initial?.usageLimit === null || initial?.usageLimit === undefined
      ? ""
      : String(initial.usageLimit),
  );
  const [perCompanyLimit, setPerCompanyLimit] = useState(
    initial?.perCompanyLimit === null || initial?.perCompanyLimit === undefined
      ? ""
      : String(initial.perCompanyLimit),
  );
  const [conditions, setConditions] = useState<PromotionRuleInput[]>(
    initial?.conditions ?? [],
  );
  const [actions, setActions] = useState<PromotionRuleInput[]>(
    initial?.actions ?? [],
  );

  const body = () => ({
    name: name.trim(),
    description: description.trim() || undefined,
    code: code.trim() ? code.trim().toUpperCase() : null,
    enabled,
    startsAt: toIso(startsAt),
    endsAt: toIso(endsAt),
    priority: Number(priority) || 0,
    stopFurther,
    usageLimit: numberOrNull(usageLimit),
    perCompanyLimit: numberOrNull(perCompanyLimit),
    conditions,
    actions,
  });

  const save = useMutation({
    mutationFn: () =>
      initial
        ? apiPatch(`/api/admin/promotions/${initial.id}`, body())
        : apiPost("/api/admin/promotions", body()),
    onSuccess: onSaved,
  });

  const canSave = name.trim().length > 0 && actions.length > 0;

  return (
    <Panel
      title={initial ? `Kampanya: ${initial.name}` : "Yeni kampanya"}
      action={
        <Button variant="secondary" onClick={onCancel}>
          Kapat
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <Label>Kampanya adı</Label>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-64"
              placeholder="Yaz kampanyası"
            />
          </label>
          <label>
            <Label hint="boşsa otomatik uygulanır">Kupon kodu</Label>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-44"
              placeholder="YAZ25"
            />
          </label>
          <label>
            <Label hint="küçük olan önce çalışır">Öncelik</Label>
            <TextInput
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-24"
            />
          </label>
        </div>

        <label className="block">
          <Label>Açıklama</Label>
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label>
            <Label hint="boşsa hemen">Başlangıç</Label>
            <TextInput
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-56"
            />
          </label>
          <label>
            <Label hint="boşsa süresiz">Bitiş</Label>
            <TextInput
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-56"
            />
          </label>
          <label>
            <Label hint="boşsa sınırsız">Toplam kullanım</Label>
            <TextInput
              type="number"
              min={1}
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              className="w-32"
            />
          </label>
          <label>
            <Label hint="boşsa sınırsız">Firma başına</Label>
            <TextInput
              type="number"
              min={1}
              value={perCompanyLimit}
              onChange={(e) => setPerCompanyLimit(e.target.value)}
              className="w-32"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Aktif
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={stopFurther}
              onChange={(e) => setStopFurther(e.target.checked)}
            />
            Uygulanırsa sonraki kampanyalar çalışmasın
          </label>
        </div>

        <RuleList
          title="Koşullar (hepsi sağlanmalı)"
          emptyHint="Koşul yok — kampanya her sepette çalışır."
          catalog={catalog.conditions}
          options={options}
          rules={conditions}
          onChange={setConditions}
        />

        <RuleList
          title="Aksiyonlar (indirimi üretir)"
          emptyHint="En az bir aksiyon ekleyin, yoksa kampanya bir şey yapmaz."
          catalog={catalog.actions}
          options={options}
          rules={actions}
          onChange={setActions}
        />

        <div className="flex items-center gap-2">
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
        </div>
        <ErrorLine error={save.error} />
      </div>
    </Panel>
  );
}
