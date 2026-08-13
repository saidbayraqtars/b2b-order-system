"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentSeriesRow } from "@repo/services";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@repo/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { LoadingState } from "@/components/ui";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";

// Numbering serials. The counter is the delicate part of this screen: it may be
// pushed forward (to continue an ERP serial that is already at 4711) but never
// pulled back, because a number that has been printed cannot be issued twice.

export function SeriesManager() {
  const qc = useQueryClient();
  const [type, setType] = useState<DocumentType>("WAYBILL");
  const [prefix, setPrefix] = useState("");
  const [padding, setPadding] = useState("6");
  const [startFrom, setStartFrom] = useState("0");
  const [externalOnly, setExternalOnly] = useState(false);

  const query = useQuery({
    queryKey: ["document-series"],
    queryFn: () =>
      apiGet<{ series: DocumentSeriesRow[] }>("/api/admin/document-series"),
  });
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["document-series"] });

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/document-series", {
        type,
        prefix: prefix.trim().toUpperCase(),
        padding: Number(padding) || 6,
        startFrom: Number(startFrom) || 0,
        isDefault: true,
        externalOnly,
      }),
    onSuccess: () => {
      setPrefix("");
      setStartFrom("0");
      setExternalOnly(false);
      invalidate();
    },
  });

  const rows = query.data?.series ?? [];

  return (
    <Panel title="Belge serileri">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label>
          <Label>Belge türü</Label>
          <Select
            className="w-40"
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
          >
            <option value="WAYBILL">{DOCUMENT_TYPE_LABELS.WAYBILL}</option>
            <option value="INVOICE">{DOCUMENT_TYPE_LABELS.INVOICE}</option>
          </Select>
        </label>
        <label>
          <Label hint="IRS, FTR…">Ön ek</Label>
          <TextInput
            className="w-28"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          <Label hint="basamak">Genişlik</Label>
          <TextInput
            type="number"
            min={1}
            max={12}
            className="w-24"
            value={padding}
            onChange={(e) => setPadding(e.target.value)}
          />
        </label>
        <label>
          <Label hint="devam edilecek son numara">Sayaç</Label>
          <TextInput
            type="number"
            min={0}
            className="w-28"
            value={startFrom}
            onChange={(e) => setStartFrom(e.target.value)}
          />
        </label>
        <Checkbox
          checked={externalOnly}
          onChange={(e) => setExternalOnly(e.target.checked)}
          label="Numarayı ERP veriyor"
        />
        <Button
          disabled={!prefix.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          Ekle
        </Button>
      </div>
      <ErrorLine error={create.error} />
      <ErrorLine error={query.error} />

      {query.isLoading && <LoadingState />}

      <ul className="space-y-2">
        {rows.map((s) => (
          <SeriesRow key={s.id} series={s} onChanged={invalidate} />
        ))}
        {query.data && rows.length === 0 && (
          <li className="text-sm text-neutral-500">
            Henüz seri yok. İrsaliye ve fatura kesebilmek için her tür için bir
            seri tanımlayın.
          </li>
        )}
      </ul>
    </Panel>
  );
}

function SeriesRow({
  series,
  onChanged,
}: {
  series: DocumentSeriesRow;
  onChanged: () => void;
}) {
  const [counter, setCounter] = useState(String(series.lastNumber));

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch(`/api/admin/document-series/${series.id}`, body),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/document-series/${series.id}`),
    onSuccess: onChanged,
  });

  return (
    <li className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {DOCUMENT_TYPE_LABELS[series.type]} · {series.prefix}
            {series.isDefault && (
              <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                varsayılan
              </span>
            )}
            {series.externalOnly && (
              <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                ERP
              </span>
            )}
          </p>
          <p className="text-neutral-500">
            Son numara {series.lastNumber} · sıradaki {series.nextNumber}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label>
            <Label hint="geri alınamaz">Sayaç</Label>
            <TextInput
              type="number"
              min={series.lastNumber}
              className="w-28"
              value={counter}
              onChange={(e) => setCounter(e.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            disabled={patch.isPending || Number(counter) === series.lastNumber}
            onClick={() => patch.mutate({ startFrom: Number(counter) })}
          >
            Kaydet
          </Button>
          {!series.isDefault && (
            <Button
              variant="secondary"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ isDefault: true })}
            >
              Varsayılan yap
            </Button>
          )}
          <Button
            variant="danger"
            disabled={series.lastNumber > 0 || remove.isPending}
            title={
              series.lastNumber > 0 ? "Numara vermiş seri silinemez" : undefined
            }
            onClick={() => {
              if (confirm(`${series.prefix} serisi silinsin mi?`))
                remove.mutate();
            }}
          >
            Sil
          </Button>
        </div>
      </div>
      <ErrorLine error={patch.error ?? remove.error} />
    </li>
  );
}
