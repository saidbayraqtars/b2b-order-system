"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ActivityEntry, ActivityKind, CompanyRow } from "@repo/services";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Label, Select } from "@/components/form";

const KIND_LABEL: Record<ActivityKind, string> = {
  ORDER_STATUS: "Sipariş",
  LEDGER: "Cari",
  AUDIT: "Sistem",
};

const KIND_CLASS: Record<ActivityKind, string> = {
  ORDER_STATUS: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  LEDGER: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  AUDIT: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The three histories in one column. Nothing here writes: each source stays the
 * record of truth for its own events, and the merge is a reading convenience.
 */
export function ActivityClient() {
  const [companyId, setCompanyId] = useState("");
  const [kind, setKind] = useState<"" | ActivityKind>("");

  const companies = useQuery({
    queryKey: ["admin-companies", "activity"],
    queryFn: () => apiGet<{ companies: CompanyRow[] }>("/api/admin/companies"),
  });

  const activity = useQuery({
    queryKey: ["activity", companyId],
    queryFn: () =>
      apiGet<{ entries: ActivityEntry[] }>(
        `/api/activity?limit=100${companyId ? `&companyId=${companyId}` : ""}`,
      ),
    refetchInterval: 30_000,
  });

  const entries = (activity.data?.entries ?? []).filter(
    (e) => !kind || e.kind === kind,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <Label>Firma</Label>
          <Select
            className="w-64"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
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
            onChange={(e) => setKind(e.target.value as "" | ActivityKind)}
          >
            <option value="">Tümü</option>
            <option value="ORDER_STATUS">Sipariş</option>
            <option value="LEDGER">Cari</option>
            <option value="AUDIT">Sistem</option>
          </Select>
        </label>
      </div>

      {activity.isLoading ? (
        <p className="text-sm text-neutral-500">Yükleniyor…</p>
      ) : activity.isError ? (
        <p className="text-sm text-red-600">{(activity.error as Error).message}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-neutral-500">Bu aralıkta hareket yok.</p>
      ) : (
        <ol className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-2 px-3 py-2 text-sm">
              <span className="w-28 shrink-0 tabular-nums text-neutral-500">
                {when(e.at)}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${KIND_CLASS[e.kind]}`}
              >
                {KIND_LABEL[e.kind]}
              </span>
              <span className="min-w-0 flex-1">
                {e.href ? (
                  <Link href={e.href} className="underline">
                    {e.summary}
                  </Link>
                ) : (
                  e.summary
                )}
                {e.companyName && (
                  <span className="text-neutral-500"> · {e.companyName}</span>
                )}
                {e.actorName && (
                  <span className="text-neutral-400"> · {e.actorName}</span>
                )}
              </span>
              {e.amount && (
                <span
                  className={`shrink-0 tabular-nums font-medium ${
                    e.amount.startsWith("-")
                      ? "text-emerald-700 dark:text-emerald-400"
                      : ""
                  }`}
                >
                  {formatTRY(e.amount)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
