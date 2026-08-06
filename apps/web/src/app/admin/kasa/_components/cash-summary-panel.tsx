"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CashSummary } from "@repo/services";
import {
  CASH_ACCOUNT_KIND_LABELS,
  CASH_MOVEMENT_SOURCE_LABELS,
} from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Button, Label, Panel, TextInput, ErrorLine } from "@/components/form";
import { Badge, EmptyState, LoadingState } from "@/components/ui";

// Gün sonu. Opens on today, because that is the question this screen is
// reached for: "bugün kasaya ne girdi".
//
// The balance column is deliberately *now*, not "at the end of the range".
// Reconstructing a past balance needs every entry since it, and quietly showing
// a stale number next to a date range would be worse than showing none.

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CashSummaryPanel() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [range, setRange] = useState({ from: today(), to: today() });

  const query = useQuery({
    queryKey: ["cash-summary", range.from, range.to],
    queryFn: () =>
      apiGet<CashSummary>(
        `/api/admin/cash-movements/summary?from=${range.from}&to=${range.to}`,
      ),
  });

  return (
    <Panel
      title="Gün sonu"
      action={
        <div className="flex items-end gap-2">
          <label>
            <Label>Başlangıç</Label>
            <TextInput
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </label>
          <label>
            <Label>Bitiş</Label>
            <TextInput
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </label>
          <Button variant="secondary" onClick={() => setRange({ from, to })}>
            Göster
          </Button>
        </div>
      }
    >
      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />

      {query.data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Total label="Giriş" value={query.data.totalIn} tone="success" />
            <Total label="Çıkış" value={query.data.totalOut} tone="danger" />
            <Total label="Net" value={query.data.net} tone="brand" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Hesaplara göre
              </h3>
              <ul className="space-y-1.5 text-sm">
                {query.data.byAccount.map((a) => (
                  <li
                    key={a.accountId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
                  >
                    <span>
                      {a.accountName}{" "}
                      <span className="text-xs text-neutral-500">
                        {CASH_ACCOUNT_KIND_LABELS[a.kind]}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-medium">
                        {formatTRY(a.currentBalance)}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        dönem neti {formatTRY(a.net)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Kaynağa göre
              </h3>
              {query.data.bySource.length === 0 ? (
                <EmptyState label="Bu aralıkta hareket yok." />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {query.data.bySource.map((s) => (
                    <li
                      key={s.source}
                      className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
                    >
                      <Badge tone="neutral">
                        {CASH_MOVEMENT_SOURCE_LABELS[s.source]}
                      </Badge>
                      <span className="text-right text-xs text-neutral-500">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          +{formatTRY(s.in)}
                        </span>{" "}
                        /{" "}
                        <span className="text-red-600 dark:text-red-400">
                          −{formatTRY(s.out)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "danger" | "brand";
}) {
  const color = {
    success: "text-emerald-600 dark:text-emerald-400",
    danger: "text-red-600 dark:text-red-400",
    brand: "text-neutral-900 dark:text-neutral-100",
  }[tone];

  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{formatTRY(value)}</p>
    </div>
  );
}
