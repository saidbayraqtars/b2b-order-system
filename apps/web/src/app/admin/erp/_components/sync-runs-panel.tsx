"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MappingStatus, SyncIssueRow, SyncRunRow } from "@repo/services";
import { ERP_SYNC_KIND_LABELS, ERP_SYNC_STATUS_LABELS } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { Button, ErrorLine, Panel } from "@/components/form";
import { Badge, EmptyState, LoadingState, type BadgeTone } from "@/components/ui";

// Eşitleme geçmişi + eşleme durumu.
//
// The two live in one panel because between them they answer one question: is
// the bridge working, and is the mapping finished? A run that applied 12 of
// 4.000 rows looks perfectly healthy on its own, which is why the skipped count
// is given the same weight as the applied one.

interface RunsResponse {
  runs: SyncRunRow[];
  mapping: MappingStatus;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  RUNNING: "info",
  SUCCEEDED: "success",
  PARTIAL: "warning",
  FAILED: "danger",
};

export function SyncRunsPanel() {
  const [openRun, setOpenRun] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["erp-runs"],
    queryFn: () => apiGet<RunsResponse>("/api/admin/erp/runs"),
    refetchInterval: 30_000,
  });

  return (
    <Panel title="Eşitleme">
      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />

      {query.data && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <MappingCard
              label="Eşlenmiş firma"
              mapped={query.data.mapping.companies.mapped}
              total={query.data.mapping.companies.total}
              hint="Cari kodu girilmemiş firmaya ERP'den veri inmez"
            />
            <MappingCard
              label="Eşlenmiş varyant"
              mapped={query.data.mapping.variants.mapped}
              total={query.data.mapping.variants.total}
              hint="Stok kodu girilmemiş varyantın stoğu güncellenmez"
            />
          </div>

          {query.data.runs.length === 0 ? (
            <EmptyState label="Henüz eşitleme yapılmadı — ajan hiç bağlanmamış olabilir." />
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {query.data.runs.map((run) => (
                <li key={run.id} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {ERP_SYNC_KIND_LABELS[run.kind]}
                        <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>
                          {ERP_SYNC_STATUS_LABELS[run.status] ?? run.status}
                        </Badge>
                      </p>
                      <p className="text-neutral-500">
                        {run.received} okundu · {run.applied} uygulandı ·{" "}
                        <span
                          className={
                            run.skipped > 0
                              ? "font-medium text-amber-600 dark:text-amber-400"
                              : ""
                          }
                        >
                          {run.skipped} eşleşmedi
                        </span>
                        {" · "}
                        {new Date(run.startedAt).toLocaleString("tr-TR")}
                        {run.agentName ? ` · ${run.agentName}` : ""}
                      </p>
                      {run.error && (
                        <p className="text-red-600 dark:text-red-400">{run.error}</p>
                      )}
                    </div>
                    {run.skipped > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setOpenRun(openRun === run.id ? null : run.id)}
                      >
                        {openRun === run.id ? "Gizle" : "Eşleşmeyenler"}
                      </Button>
                    )}
                  </div>
                  {openRun === run.id && <IssueList runId={run.id} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function MappingCard({
  label,
  mapped,
  total,
  hint,
}: {
  label: string;
  mapped: number;
  total: number;
  hint: string;
}) {
  const percent = total === 0 ? 0 : Math.round((mapped / total) * 100);

  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-lg font-semibold">
        {mapped} / {total}{" "}
        <span className="text-sm font-normal text-neutral-500">%{percent}</span>
      </p>
      <p className="text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

/**
 * The unmatched codes. This is the useful half of a partial run: the code is
 * what an operator pastes into the ERP to find out what the row was, and then
 * into the firma or ürün card to finish the mapping.
 */
function IssueList({ runId }: { runId: string }) {
  const query = useQuery({
    queryKey: ["erp-issues", runId],
    queryFn: () =>
      apiGet<{ issues: SyncIssueRow[] }>(`/api/admin/erp/runs/${runId}/issues`),
  });

  return (
    <div className="mt-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />
      {query.data && (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="pb-1 pr-3">ERP kodu</th>
                <th className="pb-1 pr-3">Ad</th>
                <th className="pb-1">Sebep</th>
              </tr>
            </thead>
            <tbody>
              {query.data.issues.map((issue) => (
                <tr key={issue.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1 pr-3 font-mono">{issue.externalCode}</td>
                  <td className="py-1 pr-3">{issue.label ?? "—"}</td>
                  <td className="py-1 text-neutral-500">{issue.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {query.data.issues.length === 0 && (
            <EmptyState label="Kayıt yok." />
          )}
        </div>
      )}
    </div>
  );
}
