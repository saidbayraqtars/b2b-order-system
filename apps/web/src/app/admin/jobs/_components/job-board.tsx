"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";

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
    queryFn: () => apiGet<{ jobs: JobRow[]; runs: RunRow[] }>("/api/admin/jobs"),
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
  if (data.isError) {
    return <p className="text-sm text-red-600">{(data.error as Error).message}</p>;
  }

  const { jobs, runs } = data.data!;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

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
              <select
                value={j.intervalMinutes}
                onChange={(e) =>
                  patch.mutate({
                    name: j.name,
                    body: { intervalMinutes: Number(e.target.value) },
                  })
                }
                className="h-8 rounded-md border border-neutral-300 px-2 text-xs dark:border-neutral-700 dark:bg-neutral-900"
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
              </select>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={j.isEnabled}
                  onChange={(e) =>
                    patch.mutate({
                      name: j.name,
                      body: { isEnabled: e.target.checked },
                    })
                  }
                />
                Açık
              </label>

              <button
                type="button"
                onClick={() => trigger.mutate(j.name)}
                disabled={trigger.isPending}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs disabled:opacity-50 dark:border-neutral-700"
              >
                <Play className="h-3.5 w-3.5" />
                Şimdi çalıştır
              </button>
            </div>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Son çalıştırmalar</h2>
        {runs.length === 0 ? (
          <EmptyState label="Henüz hiçbir iş çalışmadı." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-2">Başlangıç</th>
                  <th className="px-3 py-2">İş</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Sonuç</th>
                  <th className="px-3 py-2">Tetikleyen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {trTime(r.startedAt)}
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">
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
                    </td>
                    <td className="px-3 py-2 text-neutral-500">
                      {r.error ?? r.summary ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">
                      {/* Boşsa zamanlayıcı çalıştırmış demektir. */}
                      {r.triggeredByName ?? "zamanlayıcı"}
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
