"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Equal } from "lucide-react";
import type { CashSummary } from "@repo/services";
import {
  CASH_ACCOUNT_KIND_LABELS,
  CASH_MOVEMENT_SOURCE_LABELS,
} from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Button, Label, Panel, TextInput, ErrorLine } from "@/components/form";
import { Badge, EmptyState, LoadingState, StatTile } from "@/components/ui";

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
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Giriş"
              value={formatTRY(query.data.totalIn)}
              hint="tahsilat, peşin sipariş, elle giriş"
              tone="positive"
              icon={<ArrowDownLeft className="h-4 w-4" />}
            />
            <StatTile
              label="Çıkış"
              value={formatTRY(query.data.totalOut)}
              hint="ödeme ve elle çıkış"
              tone="critical"
              icon={<ArrowUpRight className="h-4 w-4" />}
            />
            <StatTile
              label="Net"
              value={formatTRY(query.data.net)}
              hint="giriş − çıkış"
              icon={<Equal className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="tech-label mb-2">Hesaplara göre</h3>
              <ul className="space-y-1.5 text-body-sm">
                {query.data.byAccount.map((a) => (
                  <li
                    key={a.accountId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
                  >
                    <span>
                      {a.accountName}{" "}
                      <span className="text-xs text-ink-faint">
                        {CASH_ACCOUNT_KIND_LABELS[a.kind]}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-medium tabular-nums">
                        {formatTRY(a.currentBalance)}
                      </span>
                      <span className="block text-xs tabular-nums text-ink-faint">
                        dönem neti {formatTRY(a.net)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="tech-label mb-2">Kaynağa göre</h3>
              {query.data.bySource.length === 0 ? (
                <EmptyState label="Bu aralıkta hareket yok." />
              ) : (
                <ul className="space-y-1.5 text-body-sm">
                  {query.data.bySource.map((s) => (
                    <li
                      key={s.source}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
                    >
                      <Badge tone="neutral">
                        {CASH_MOVEMENT_SOURCE_LABELS[s.source]}
                      </Badge>
                      <span className="text-right text-xs tabular-nums">
                        <span className="text-positive">
                          +{formatTRY(s.in)}
                        </span>{" "}
                        <span className="text-ink-faint">/</span>{" "}
                        <span className="text-critical">
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
