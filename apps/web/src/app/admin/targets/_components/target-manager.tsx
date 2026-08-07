"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TARGET_METRIC_LABELS,
  TARGET_PERIOD_LABELS,
  TargetMetricEnum,
  TargetPeriodEnum,
  type TargetMetric,
  type TargetPeriod,
} from "@repo/types";
import { apiDelete, apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";

// Temsilci hedefleri.
//
// Hedef koymak ayrı bir izin (`targets.manage`), görmek değil: bir yöneticinin
// raporu okuyup hedefi değiştirememesi normal bir ayrım.

interface Rep {
  id: string;
  name: string;
  email: string;
}

interface TargetRow {
  id: string;
  salesRepId: string;
  salesRepName: string;
  metric: TargetMetric;
  period: TargetPeriod;
  periodStart: string;
  periodEnd: string;
  targetValue: string;
  note: string | null;
  createdByName: string;
}

interface ProgressRow extends TargetRow {
  achieved: string;
  percent: number;
  elapsed: number;
}

const METRICS = TargetMetricEnum.options;
const PERIODS = TargetPeriodEnum.options;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function trDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR");
}

/** Ziyaret adet, ciro para. Aynı kolonda iki farklı büyüklük duruyor. */
function formatValue(metric: TargetMetric, value: string): string {
  return metric === "REVENUE"
    ? formatTRY(value)
    : `${Math.round(Number(value))} ziyaret`;
}

export function TargetManager({ reps }: { reps: Rep[] }) {
  const qc = useQueryClient();
  const [repId, setRepId] = useState(reps[0]?.id ?? "");
  const [metric, setMetric] = useState<TargetMetric>("REVENUE");
  const [period, setPeriod] = useState<TargetPeriod>("MONTHLY");
  const [periodStart, setPeriodStart] = useState(today());
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const targets = useQuery({
    queryKey: ["sales-targets", repId],
    queryFn: () =>
      apiGet<{ targets: TargetRow[] }>(
        `/api/sales-targets${repId ? `?salesRepId=${repId}` : ""}`,
      ),
    enabled: reps.length > 0,
  });

  const progress = useQuery({
    queryKey: ["sales-target-progress", repId],
    queryFn: () =>
      apiGet<{ progress: ProgressRow[] }>(
        `/api/sales-targets?progress=1&salesRepId=${repId}`,
      ),
    enabled: !!repId,
  });

  const save = useMutation({
    mutationFn: () =>
      apiPost("/api/sales-targets", {
        salesRepId: repId,
        metric,
        period,
        periodStart,
        targetValue: value,
        note: note || undefined,
      }),
    onSuccess: () => {
      setValue("");
      setNote("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["sales-targets"] });
      void qc.invalidateQueries({ queryKey: ["sales-target-progress"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/sales-targets/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sales-targets"] });
      void qc.invalidateQueries({ queryKey: ["sales-target-progress"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const rows = useMemo(() => targets.data?.targets ?? [], [targets.data]);

  if (reps.length === 0) {
    return <EmptyState label="Hedef konacak satış temsilcisi yok." />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 text-sm font-semibold">Hedef koy</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Temsilci</span>
            <select
              value={repId}
              onChange={(e) => setRepId(e.target.value)}
              className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Ölçü</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as TargetMetric)}
              className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {TARGET_METRIC_LABELS[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Dönem</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as TargetPeriod)}
              className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {TARGET_PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              Dönem içinde bir gün
            </span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              {metric === "REVENUE" ? "Tutar" : "Ziyaret adedi"}
            </span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder={metric === "REVENUE" ? "250000" : "80"}
              className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Not</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!value || save.isPending}
            className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {save.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <p className="text-xs text-neutral-500">
            Aynı dönem için ikinci hedef açılmaz; değer güncellenir.
          </p>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Bu dönemin durumu</h2>
        {progress.isLoading ? (
          <LoadingState />
        ) : (progress.data?.progress.length ?? 0) === 0 ? (
          <EmptyState label="Bu temsilci için açık dönem hedefi yok." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {progress.data!.progress.map((p) => (
              <ProgressCard key={p.id} row={p} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Tanımlı hedefler</h2>
        {targets.isLoading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState label="Henüz hedef tanımlanmadı." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-2">Temsilci</th>
                  <th className="px-3 py-2">Ölçü</th>
                  <th className="px-3 py-2">Dönem</th>
                  <th className="px-3 py-2">Başlangıç</th>
                  <th className="px-3 py-2 text-right">Hedef</th>
                  <th className="px-3 py-2">Koyan</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2">{t.salesRepName}</td>
                    <td className="px-3 py-2">{TARGET_METRIC_LABELS[t.metric]}</td>
                    <td className="px-3 py-2">{TARGET_PERIOD_LABELS[t.period]}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {trDate(t.periodStart)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatValue(t.metric, t.targetValue)}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">{t.createdByName}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove.mutate(t.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Kaldır
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Hedef kartı.
 *
 * Yüzdenin yanında dönemin ne kadarının geçtiği de gösteriliyor: ayın 3'ünde
 * %10 iyi, 28'inde felakettir ve tek başına yüzde bu farkı gizler.
 */
function ProgressCard({ row }: { row: ProgressRow }) {
  const elapsedPct = Math.round(row.elapsed * 100);
  const behind = row.percent + 5 < elapsedPct;

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {TARGET_METRIC_LABELS[row.metric]} ·{" "}
          <span className="text-neutral-500">
            {TARGET_PERIOD_LABELS[row.period]}
          </span>
        </p>
        <Badge tone={behind ? "warning" : row.percent >= 100 ? "success" : "info"}>
          %{row.percent}
        </Badge>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className={
            row.percent >= 100
              ? "h-full bg-emerald-500"
              : behind
                ? "h-full bg-amber-500"
                : "h-full bg-brand-500"
          }
          style={{ width: `${Math.min(100, row.percent)}%` }}
        />
      </div>

      <p className="mt-2 text-sm tabular-nums">
        {formatValue(row.metric, row.achieved)}{" "}
        <span className="text-neutral-500">
          / {formatValue(row.metric, row.targetValue)}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">
        {trDate(row.periodStart)} — {trDate(row.periodEnd)} · dönemin %
        {elapsedPct}&apos;i geçti
      </p>
    </Card>
  );
}
