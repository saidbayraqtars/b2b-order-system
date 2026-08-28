"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ActivityEntry, ActivityKind, CompanyRow } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { useUrlState } from "@/lib/url-state";
import {
  Badge,
  EmptyState,
  LoadingState,
  type BadgeTone,
} from "@/components/ui";
import { formatTRY } from "@/lib/format";
import { Button, ErrorLine, Label, Select } from "@/components/form";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ActivityKind, string> = {
  ORDER_STATUS: "Sipariş",
  LEDGER: "Cari",
  AUDIT: "Sistem",
};

// Üç kaynağın künyesi. Renk burada da işaret: para hareketi yeşil, sistem
// kaydı nötr, sipariş ise akışın kendisi — vurgulanmıyor, çünkü satırların
// çoğu zaten sipariş.
const KIND_TONE: Record<ActivityKind, BadgeTone> = {
  ORDER_STATUS: "info",
  LEDGER: "success",
  AUDIT: "neutral",
};

// 50, 100 değil: yüz satır sayfayı altı bin pikselin ötesine taşıyor ve
// altındaki dipnot hiç görünmüyordu. Akışta gezinmenin yolu kaydırmak değil,
// üstteki iki süzgeç.
const LIMIT = 50;

function when(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Süzgeç varsayılanları — modül düzeyinde, `useUrlState` kimlik bekliyor. */
const FILTER_DEFAULTS = { firma: "", tur: "" };

/**
 * The three histories in one column. Nothing here writes: each source stays the
 * record of truth for its own events, and the merge is a reading convenience.
 */
export function ActivityClient() {
  const filters = useUrlState(FILTER_DEFAULTS);
  const companyId = filters.value.firma;
  const kind = filters.value.tur as "" | ActivityKind;

  const companies = useQuery({
    queryKey: ["admin-companies", "activity"],
    queryFn: () => apiGet<{ companies: CompanyRow[] }>("/api/admin/companies"),
  });

  const activity = useQuery({
    queryKey: ["activity", companyId],
    queryFn: () =>
      apiGet<{ entries: ActivityEntry[] }>(
        `/api/activity?limit=${LIMIT}${companyId ? `&companyId=${companyId}` : ""}`,
      ),
    refetchInterval: 30_000,
  });

  const entries = (activity.data?.entries ?? []).filter(
    (e) => !kind || e.kind === kind,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-sunken p-3">
        <label>
          <Label>Firma</Label>
          <Select
            className="w-64"
            value={companyId}
            onChange={(e) => filters.set({ firma: e.target.value })}
          >
            <option value="">Tümü</option>
            {(companies.data?.companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>Tür</Label>
          <Select
            className="w-44"
            value={kind}
            onChange={(e) => filters.set({ tur: e.target.value })}
          >
            <option value="">Tümü</option>
            <option value="ORDER_STATUS">Sipariş</option>
            <option value="LEDGER">Cari</option>
            <option value="AUDIT">Sistem</option>
          </Select>
        </label>
      </div>

      {activity.isLoading ? (
        <LoadingState />
      ) : activity.isError ? (
        <ErrorLine error={activity.error} />
      ) : entries.length === 0 ? (
        <EmptyState
          label={
            filters.isFiltered
              ? "Bu süzgeçte hareket yok."
              : "Henüz hareket yok."
          }
          action={
            filters.isFiltered ? (
              <Button size="sm" variant="secondary" onClick={filters.clear}>
                Süzgeci temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line bg-panel">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-baseline gap-2 px-3 py-2 text-body-sm text-ink"
            >
              <span className="w-28 shrink-0 tabular-nums text-ink-faint">
                {when(e.at)}
              </span>
              <Badge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
              <span className="min-w-0 flex-1">
                {e.href ? (
                  <Link href={e.href} className="underline">
                    {e.summary}
                  </Link>
                ) : (
                  e.summary
                )}
                {e.companyName && (
                  <span className="text-ink-muted"> · {e.companyName}</span>
                )}
                {e.actorName && (
                  <span className="text-ink-faint"> · {e.actorName}</span>
                )}
              </span>
              {/* Eksi bakiye hareketi = tahsilat, borcu azaltan tek şey. */}
              {e.amount && (
                <span
                  className={cn(
                    "shrink-0 font-medium tabular-nums",
                    e.amount.startsWith("-") && "text-positive",
                  )}
                >
                  {formatTRY(e.amount)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {entries.length > 0 && (
        <p className="text-xs text-ink-faint">
          Son {entries.length} hareket gösteriliyor. Daha eskisi için firma ya
          da tür süzgecini daraltın.
        </p>
      )}
    </div>
  );
}
