"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
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
import { Button, Checkbox, ErrorLine, Panel, Select } from "@/components/form";

// Bakım işleri paneli.
//
// Ekranın tek amacı görünürlük: bu işler arka planda kendiliğinden çalışıyor ve
// sessizce çalışmayı bırakabilirler. "En son ne zaman çalıştı, ne oldu"
// sorusunu cevaplayacak bir yer olmadan, patlamış bir temizlik işi aylarca fark
// edilmezdi.

interface JobRow {
  name: string;
  label: string;
  description: string;
  intervalMinutes: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastSummary: string | null;
  isEnabled: boolean;
}

interface RunRow {
  id: string;
  name: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  summary: string | null;
  error: string | null;
  triggeredByName: string | null;
}

function trTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Dakikayı okunur hâle getir: 1440 → "günde bir". */
function intervalLabel(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "Günde bir" : `${days} günde bir`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "Saatte bir" : `${hours} saatte bir`;
  }
  return `${minutes} dakikada bir`;
}

const INTERVALS = [60, 360, 720, 1440, 4320, 10080];

export function JobBoard() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["admin", "jobs"],
    queryFn: () =>
      apiGet<{ jobs: JobRow[]; runs: RunRow[] }>("/api/admin/jobs"),
    // Elle tetiklenen iş birkaç saniye sürebiliyor; sayfa açıkken kendini
    // tazelemesi, kullanıcının F5'e basmasından iyi.
    refetchInterval: 30_000,
  });

  const patch = useMutation({
    mutationFn: (v: {
      name: string;
      body: { isEnabled?: boolean; intervalMinutes?: number };
    }) => apiPatch(`/api/admin/jobs/${v.name}`, v.body),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["admin", "jobs"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const trigger = useMutation({
    mutationFn: (name: string) => apiPost(`/api/admin/jobs/${name}`, {}),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["admin", "jobs"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  if (data.isLoading) return <LoadingState />;
  if (data.isError) return <ErrorLine error={data.error} />;

  const { jobs, runs } = data.data!;

  return (
    <div className="space-y-6">
      <ErrorLine error={error ? new Error(error) : null} />

      <div className="grid gap-3 lg:grid-cols-2">
        {jobs.map((j) => (
          <Card key={j.name}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{j.label}</p>
                <p className="text-sm text-neutral-500">{j.description}</p>
              </div>
              {j.lastStatus === "ERROR" ? (
                <Badge tone="danger">Hata</Badge>
              ) : j.isEnabled ? (
                <Badge tone="success">Açık</Badge>
              ) : (
                <Badge tone="neutral">Kapalı</Badge>
              )}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-neutral-500">Son çalışma</dt>
              <dd className="tabular-nums">{trTime(j.lastRunAt)}</dd>
              <dt className="text-neutral-500">Sıradaki</dt>
              <dd className="tabular-nums">
                {j.isEnabled ? trTime(j.nextRunAt) : "—"}
              </dd>
            </dl>

            {j.lastSummary && (
              <p
                className={`mt-2 text-sm ${
                  j.lastStatus === "ERROR" ? "text-red-600" : "text-neutral-500"
                }`}
              >
                {j.lastSummary}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select
                aria-label={`${j.label} periyodu`}
                value={j.intervalMinutes}
                onChange={(e) =>
                  patch.mutate({
                    name: j.name,
                    body: { intervalMinutes: Number(e.target.value) },
                  })
                }
                className="h-8 w-auto text-xs"
              >
                {/* Kayıtlı periyot listede yoksa da görünsün — operatörün
                    seçtiği değer, açılır listede yok diye kaybolmamalı. */}
                {(INTERVALS.includes(j.intervalMinutes)
                  ? INTERVALS
                  : [...INTERVALS, j.intervalMinutes].sort((a, b) => a - b)
                ).map((m) => (
                  <option key={m} value={m}>
                    {intervalLabel(m)}
                  </option>
                ))}
              </Select>

              <Checkbox
                checked={j.isEnabled}
                onChange={(e) =>
                  patch.mutate({
                    name: j.name,
                    body: { isEnabled: e.target.checked },
                  })
                }
                label="Açık"
              />

              <Button
                variant="secondary"
                size="sm"
                className="ml-auto"
                loading={trigger.isPending}
                onClick={() => trigger.mutate(j.name)}
              >
                <Play className="h-3.5 w-3.5" />
                Şimdi çalıştır
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Panel title="Son çalıştırmalar">
        {runs.length === 0 ? (
          <EmptyState label="Henüz hiçbir iş çalışmadı." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Başlangıç</Th>
                <Th>İş</Th>
                <Th>Durum</Th>
                <Th>Sonuç</Th>
                <Th>Tetikleyen</Th>
              </tr>
            </THead>
            <TBody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap" numeric>
                    {trTime(r.startedAt)}
                  </Td>
                  <Td>{r.name}</Td>
                  <Td>
                    <Badge
                      tone={
                        r.status === "ERROR"
                          ? "danger"
                          : r.status === "OK"
                            ? "success"
                            : "info"
                      }
                    >
                      {r.status}
                    </Badge>
                  </Td>
                  <Td muted>{r.error ?? r.summary ?? "—"}</Td>
                  {/* Boşsa zamanlayıcı çalıştırmış demektir. */}
                  <Td muted>{r.triggeredByName ?? "zamanlayıcı"}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
