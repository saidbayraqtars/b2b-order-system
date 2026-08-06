"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VolumeTierRow } from "@repo/services";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
import { Badge, EmptyState, LoadingState } from "@/components/ui";

// The turnover ladder. Every rung is the same offer to every customer, so
// editing one reprices the whole book — which is why a private rate belongs on
// the company's own screen as a CompanyDiscount instead.
//
// A rung customers are pinned to cannot be deleted: the service refuses and
// asks for it to be deactivated, so those customers keep the rate they were
// promised rather than silently losing it.

interface Draft {
  name: string;
  minRevenue: string;
  windowMonths: string;
  discountPercent: string;
}

const EMPTY: Draft = {
  name: "",
  minRevenue: "",
  windowMonths: "12",
  discountPercent: "",
};

function toPayload(d: Draft) {
  return {
    name: d.name.trim(),
    minRevenue: Number(d.minRevenue),
    windowMonths: Number(d.windowMonths),
    discountPercent: Number(d.discountPercent),
  };
}

/** Guards the button rather than the request — the schema is the real check. */
function isComplete(d: Draft): boolean {
  const p = toPayload(d);
  return (
    p.name.length > 0 &&
    Number.isFinite(p.minRevenue) &&
    p.minRevenue >= 0 &&
    Number.isFinite(p.windowMonths) &&
    p.windowMonths >= 1 &&
    Number.isFinite(p.discountPercent) &&
    p.discountPercent > 0
  );
}

export function TiersManager() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const query = useQuery({
    queryKey: ["admin-volume-tiers"],
    queryFn: () => apiGet<{ tiers: VolumeTierRow[] }>("/api/admin/volume-tiers"),
  });
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["admin-volume-tiers"] });

  const create = useMutation({
    mutationFn: () => apiPost("/api/admin/volume-tiers", toPayload(draft)),
    onSuccess: () => {
      setDraft(EMPTY);
      invalidate();
    },
  });

  return (
    <Panel title="Hacim basamakları">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <DraftFields draft={draft} onChange={setDraft} />
        <Button
          disabled={create.isPending || !isComplete(draft)}
          onClick={() => create.mutate()}
        >
          Ekle
        </Button>
      </div>
      <ErrorLine error={create.error} />

      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />

      {query.data && (
        <ul className="space-y-2">
          {query.data.tiers.map((t) => (
            <TierRow key={t.id} tier={t} onChanged={invalidate} />
          ))}
          {query.data.tiers.length === 0 && (
            <li>
              <EmptyState label="Henüz hacim basamağı yok — merdiven boşken kimse iskonto almaz." />
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function DraftFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });

  return (
    <>
      <label>
        <Label>Basamak adı</Label>
        <TextInput
          value={draft.name}
          placeholder="Gümüş, Altın…"
          onChange={(e) => set({ name: e.target.value })}
          className="w-40"
        />
      </label>
      <label>
        <Label hint="KDV ve navlun hariç">Alt ciro sınırı</Label>
        <TextInput
          type="number"
          min={0}
          step="0.01"
          value={draft.minRevenue}
          placeholder="500000"
          onChange={(e) => set({ minRevenue: e.target.value })}
          className="w-36"
        />
      </label>
      <label>
        <Label hint="geriye dönük">Dönem (ay)</Label>
        <TextInput
          type="number"
          min={1}
          max={60}
          value={draft.windowMonths}
          onChange={(e) => set({ windowMonths: e.target.value })}
          className="w-24"
        />
      </label>
      <label>
        <Label hint="firma iskontosunun üstüne">İskonto %</Label>
        <TextInput
          type="number"
          min={0.01}
          max={90}
          step="0.01"
          value={draft.discountPercent}
          placeholder="5"
          onChange={(e) => set({ discountPercent: e.target.value })}
          className="w-24"
        />
      </label>
    </>
  );
}

function TierRow({
  tier,
  onChanged,
}: {
  tier: VolumeTierRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    name: tier.name,
    minRevenue: tier.minRevenue,
    windowMonths: String(tier.windowMonths),
    discountPercent: tier.discountPercent,
  });

  const save = useMutation({
    mutationFn: () => apiPatch(`/api/admin/volume-tiers/${tier.id}`, toPayload(draft)),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });
  const toggle = useMutation({
    mutationFn: () =>
      apiPatch(`/api/admin/volume-tiers/${tier.id}`, { isActive: !tier.isActive }),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/volume-tiers/${tier.id}`),
    onSuccess: onChanged,
  });

  const locked = tier.companyCount > 0;

  return (
    <li className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <DraftFields draft={draft} onChange={setDraft} />
            <Button
              disabled={save.isPending || !isComplete(draft)}
              onClick={() => save.mutate()}
            >
              Kaydet
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
          </div>
        ) : (
          <div className="text-sm">
            <p className="flex items-center gap-2 font-medium">
              {tier.name}
              <Badge tone="success">%{tier.discountPercent}</Badge>
              {!tier.isActive && <Badge tone="neutral">Pasif</Badge>}
            </p>
            <p className="text-neutral-500">
              Son {tier.windowMonths} ayda {formatTRY(tier.minRevenue)} ciro ·{" "}
              {tier.companyCount} firmaya elle atanmış
            </p>
          </div>
        )}

        {!editing && (
          <div className="flex gap-1">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Düzenle
            </Button>
            <Button
              variant="secondary"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {tier.isActive ? "Pasife al" : "Aktifleştir"}
            </Button>
            <Button
              variant="danger"
              disabled={locked || remove.isPending}
              title={
                locked
                  ? "Firmalara atanmış basamak silinemez — pasife alın"
                  : undefined
              }
              onClick={() => {
                if (confirm(`"${tier.name}" basamağı silinsin mi?`)) remove.mutate();
              }}
            >
              Sil
            </Button>
          </div>
        )}
      </div>
      <ErrorLine error={save.error ?? toggle.error ?? remove.error} />
    </li>
  );
}
