"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MappingStatus, SyncIssueRow, SyncRunRow } from "@repo/services";
import { ERP_SYNC_KIND_LABELS, ERP_SYNC_STATUS_LABELS } from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { Button, ErrorLine, Panel } from "@/components/form";
import {
  Badge,
  EmptyState,
  LoadingState,
  StatTile,
  Table,
  TBody,
  Td,
  Th,
  THead,
  type BadgeTone,
} from "@/components/ui";

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
    <Panel title="Eşitleme" bodyClassName="p-0">
      {query.isLoading && (
        <div className="px-4">
          <LoadingState />
        </div>
      )}
      {query.error ? (
        <div className="p-4">
          <ErrorLine error={query.error} />
        </div>
      ) : null}

      {query.data && (
        <>
          {/* Eşleme oranı köprünün yarısı: çalışan ama hiçbir şeyi eşleyemeyen
              bir eşitleme de "başarılı" görünür. */}
          <div className="grid gap-3 border-b border-line bg-sunken p-4 sm:grid-cols-2">
            <MappingTile
              label="Eşlenmiş firma"
              mapped={query.data.mapping.companies.mapped}
              total={query.data.mapping.companies.total}
              hint="Cari kodu girilmemiş firmaya ERP'den veri inmez"
            />
            <MappingTile
              label="Eşlenmiş varyant"
              mapped={query.data.mapping.variants.mapped}
              total={query.data.mapping.variants.total}
              hint="Stok kodu girilmemiş varyantın stoğu güncellenmez"
            />
          </div>

          {query.data.runs.length === 0 ? (
            <EmptyState label="Henüz eşitleme yapılmadı — ajan hiç bağlanmamış olabilir." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Başlangıç</Th>
                  <Th>Tür</Th>
                  <Th>Durum</Th>
                  <Th align="right">Okundu</Th>
                  <Th align="right">Uygulandı</Th>
                  <Th align="right">Eşleşmedi</Th>
                  <Th>Ajan</Th>
                  <Th />
                </tr>
              </THead>
              <TBody>
                {query.data.runs.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    open={openRun === run.id}
                    onToggle={() =>
                      setOpenRun(openRun === run.id ? null : run.id)
                    }
                  />
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}
    </Panel>
  );
}

function RunRow({
  run,
  open,
  onToggle,
}: {
  run: SyncRunRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <Td numeric className="whitespace-nowrap">
          {new Date(run.startedAt).toLocaleString("tr-TR")}
        </Td>
        <Td>{ERP_SYNC_KIND_LABELS[run.kind]}</Td>
        <Td>
          <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>
            {ERP_SYNC_STATUS_LABELS[run.status] ?? run.status}
          </Badge>
        </Td>
        <Td align="right" numeric>
          {run.received}
        </Td>
        <Td align="right" numeric>
          {run.applied}
        </Td>
        <Td align="right" numeric>
          {/* Sıfırdan büyük her değer bir iş: o satırlar ERP'de var, burada
              karşılığı yok. */}
          <span className={run.skipped > 0 ? "font-medium text-caution" : ""}>
            {run.skipped}
          </span>
        </Td>
        <Td muted>{run.agentName ?? "—"}</Td>
        <Td align="right">
          {run.skipped > 0 && (
            <Button size="sm" variant="secondary" onClick={onToggle}>
              {open ? "Gizle" : "Eşleşmeyenler"}
            </Button>
          )}
        </Td>
      </tr>

      {/* Hata ve döküm hücreye değil alt satıra: hücreye konsaydı o sütunu
          bütün tablo boyunca genişletirdi (kasa defterindeki çözümün aynısı). */}
      {run.error && (
        <tr>
          <Td colSpan={8} className="pt-0 text-critical">
            {run.error}
          </Td>
        </tr>
      )}
      {open && (
        <tr>
          <Td colSpan={8} className="bg-sunken">
            <IssueList runId={run.id} />
          </Td>
        </tr>
      )}
    </>
  );
}

function MappingTile({
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
    <StatTile
      label={label}
      value={`${mapped} / ${total}`}
      tone={
        percent === 100 ? "positive" : percent === 0 ? "critical" : "caution"
      }
      hint={`%${percent} · ${hint}`}
    />
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
    <div className="rounded border border-line bg-panel p-3">
      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />
      {query.data &&
        (query.data.issues.length === 0 ? (
          <EmptyState label="Kayıt yok." />
        ) : (
          // Bu liste yüzlerce satır olabiliyor; kendi içinde kaydırıyor ki
          // sayfanın altındaki paneller ekran dışına itilmesin.
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="tech-label">
                <tr>
                  <th className="pb-1 pr-3">ERP kodu</th>
                  <th className="pb-1 pr-3">Ad</th>
                  <th className="pb-1">Sebep</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {query.data.issues.map((issue) => (
                  <tr key={issue.id}>
                    <td className="py-1 pr-3 font-mono text-ink">
                      {issue.externalCode}
                    </td>
                    <td className="py-1 pr-3 text-ink">{issue.label ?? "—"}</td>
                    <td className="py-1 text-ink-muted">{issue.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
