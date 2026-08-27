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
  LinkButton,
  Panel,
  Select,
} from "@/components/form";
import { Field } from "@/components/ui";

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
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Toplam kayıt">
            {s ? s.total.toLocaleString("tr-TR") : "…"}
          </Field>
          <Field label="En eski">{s ? date(s.oldest) : "…"}</Field>
          <Field label="En yeni">{s ? date(s.newest) : "…"}</Field>
          <Field label={`${retentionDays} günden eski`}>
            {s ? s.olderThanRetention.toLocaleString("tr-TR") : "…"}
          </Field>
        </dl>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="retention-days">Saklama süresi</Label>
            <Select
              id="retention-days"
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
          </div>

          <div className="pb-2.5">
            <Checkbox
              checked={keepSecurity}
              onChange={(e) => setKeepSecurity(e.target.checked)}
              label="Güvenlik olaylarını sakla"
            />
          </div>

          {/* Kopya almak silmenin öncesi, sonrası değil: iki eylem yan yana
              duruyor ve indirme sakin, silme dolu kırmızı. */}
          <LinkButton size="md" href="/api/admin/audit/export">
            CSV indir
          </LinkButton>

          <Button
            variant="danger"
            loading={purge.isPending}
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
          <p className="rounded border border-positive/30 bg-positive/10 px-3 py-2 text-body-sm text-positive">
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
