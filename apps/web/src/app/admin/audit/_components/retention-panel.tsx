"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuditStats } from "@repo/services";
import { apiGet, apiPost } from "@/lib/fetcher";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
} from "@/components/form";

const RETENTION_CHOICES = [90, 180, 365, 730, 1095];

function date(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("tr-TR") : "—";
}

/**
 * Retention and export.
 *
 * Deleting audit entries is the one write that breaks the append-only rule, so
 * the screen shows what would go before it offers to do it, and the export sits
 * next to it — taking a copy before deleting is the normal order of operations,
 * not an afterthought.
 */
export function RetentionPanel() {
  const qc = useQueryClient();
  const [retentionDays, setRetentionDays] = useState(365);
  const [keepSecurity, setKeepSecurity] = useState(true);

  const stats = useQuery({
    queryKey: ["audit-stats"],
    queryFn: () => apiGet<AuditStats>("/api/admin/audit/retention"),
  });

  const purge = useMutation({
    mutationFn: () =>
      apiPost<{ deleted: number; oldestRemaining: string | null }>(
        "/api/admin/audit/retention",
        { retentionDays, keepSecurityActions: keepSecurity },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["audit-stats"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const s = stats.data;

  return (
    <Panel title="Saklama ve arşiv">
      <div className="flex flex-col gap-4 text-sm">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Toplam kayıt"
            value={s ? s.total.toLocaleString("tr-TR") : "…"}
          />
          <Stat label="En eski" value={s ? date(s.oldest) : "…"} />
          <Stat label="En yeni" value={s ? date(s.newest) : "…"} />
          <Stat
            label={`${retentionDays} günden eski`}
            value={s ? s.olderThanRetention.toLocaleString("tr-TR") : "…"}
          />
        </dl>

        <div className="flex flex-wrap items-end gap-3">
          <label>
            <Label>Saklama süresi</Label>
            <Select
              className="w-40"
              value={String(retentionDays)}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
            >
              {RETENTION_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {d} gün
                </option>
              ))}
            </Select>
          </label>

          <Checkbox
            checked={keepSecurity}
            onChange={(e) => setKeepSecurity(e.target.checked)}
            label="Güvenlik olaylarını sakla"
          />

          <a
            href="/api/admin/audit/export"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-neutral-700"
          >
            CSV indir
          </a>

          <Button
            variant="danger"
            disabled={purge.isPending}
            onClick={() => {
              const count = s?.olderThanRetention ?? 0;
              if (
                confirm(
                  `${retentionDays} günden eski ${count} kayıt silinecek. Bu geri alınamaz — önce CSV indirdiniz mi?`,
                )
              ) {
                purge.mutate();
              }
            }}
          >
            {purge.isPending ? "Siliniyor…" : "Eski kayıtları sil"}
          </Button>
        </div>

        {purge.data && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {purge.data.deleted} kayıt silindi. Kalan en eski kayıt:{" "}
            {date(purge.data.oldestRemaining)}
          </p>
        )}
        <ErrorLine error={purge.error} />
        <ErrorLine error={stats.error} />
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
