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
import {
  Badge,
  Card,
  EmptyState,
  LoadingState,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";

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
      <Panel title="Hedef koy">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <Label htmlFor="target-rep">Temsilci</Label>
            <Select
              id="target-rep"
              value={repId}
              onChange={(e) => setRepId(e.target.value)}
            >
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="target-metric">Ölçü</Label>
            <Select
              id="target-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as TargetMetric)}
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {TARGET_METRIC_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="target-period">Dönem</Label>
            <Select
              id="target-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as TargetPeriod)}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {TARGET_PERIOD_LABELS[p]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="target-start">Dönem içinde bir gün</Label>
            <TextInput
              id="target-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="target-value">
              {metric === "REVENUE" ? "Tutar" : "Ziyaret adedi"}
            </Label>
            <TextInput
              id="target-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder={metric === "REVENUE" ? "250000" : "80"}
            />
          </div>

          <div>
            <Label htmlFor="target-note">Not</Label>
            <TextInput
              id="target-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={() => save.mutate()}
            disabled={!value}
            loading={save.isPending}
          >
            Kaydet
          </Button>
          <p className="text-xs text-neutral-500">
            Aynı dönem için ikinci hedef açılmaz; değer güncellenir.
          </p>
        </div>

        <ErrorLine error={error ? new Error(error) : null} />
      </Panel>

      <Panel title="Bu dönemin durumu">
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
      </Panel>

      <Panel title="Tanımlı hedefler">
        {targets.isLoading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState label="Henüz hedef tanımlanmadı." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Temsilci</Th>
                <Th>Ölçü</Th>
                <Th>Dönem</Th>
                <Th>Başlangıç</Th>
                <Th align="right">Hedef</Th>
                <Th>Koyan</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <Td>{t.salesRepName}</Td>
                  <Td>{TARGET_METRIC_LABELS[t.metric]}</Td>
                  <Td>{TARGET_PERIOD_LABELS[t.period]}</Td>
                  <Td numeric>{trDate(t.periodStart)}</Td>
                  <Td align="right" numeric>
                    {formatValue(t.metric, t.targetValue)}
                  </Td>
                  <Td muted>{t.createdByName}</Td>
                  <Td align="right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => remove.mutate(t.id)}
                    >
                      Kaldır
                    </Button>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
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
