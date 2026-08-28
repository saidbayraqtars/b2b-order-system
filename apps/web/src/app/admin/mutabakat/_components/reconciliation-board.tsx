"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ReconciliationRow,
  ReconciliationSummary,
} from "@repo/services";
import {
  RECONCILIATION_STATUS_LABELS,
  type ReconciliationStatus,
} from "@repo/types";
import { apiDelete, apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  TextInput,
} from "@/components/form";
import {
  Badge,
  type BadgeTone,
  Chips,
  LoadingState,
  StatTile,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { useToast } from "@/components/toast";

// Cari mutabakat — satıcı tarafı.
//
// Ekran iki iş yapıyor: dönem mektuplarını **toplu** üretiyor ve gelen
// cevapları listeliyor. Toplu üretim tek düğme, çünkü mutabakat firma firma
// yapılan bir iş değil: dönem kapanır, herkese aynı anda gider.

const STATUS_TONE: Record<ReconciliationStatus, BadgeTone> = {
  SENT: "warning",
  AGREED: "success",
  DISPUTED: "danger",
  CANCELLED: "neutral",
};

const STATUS_FILTERS = (
  ["SENT", "DISPUTED", "AGREED", "CANCELLED"] as const
).map((key) => ({ key, label: RECONCILIATION_STATUS_LABELS[key] }));

/** Süzgeç varsayılanı — modül düzeyinde, `useUrlState` kimlik bekliyor. */
const FILTER_DEFAULTS = { durum: "SENT" };

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Geçen ayın ilk ve son günü — mutabakatın olağan dönemi. */
function lastMonth(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  return { from: iso(start), to: iso(end) };
}

export function ReconciliationBoard() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const filters = useUrlState(FILTER_DEFAULTS);
  const status = filters.value.durum as ReconciliationStatus;

  const period = lastMonth();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [includeZero, setIncludeZero] = useState(false);

  const query = useQuery({
    queryKey: ["reconciliations", status],
    queryFn: () =>
      apiGet<{
        reconciliations: ReconciliationRow[];
        summary: ReconciliationSummary | null;
      }>(`/api/reconciliations?status=${status}`),
  });

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["reconciliations"] });

  const send = useMutation({
    mutationFn: () =>
      apiPost<{
        result: { created: number; skippedOpen: number; skippedZero: number };
      }>("/api/reconciliations", {
        from,
        to,
        includeZeroBalance: includeZero,
      }),
    onSuccess: (data) => {
      invalidate();
      notify(`${data.result.created} mutabakat gönderildi`);
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/reconciliations/${id}`),
    onSuccess: () => {
      invalidate();
      notify("Mutabakat geri çekildi");
    },
  });

  const rows = query.data?.reconciliations ?? [];
  const summary = query.data?.summary;

  return (
    <div className="flex flex-col gap-5">
      {summary && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Cevap bekleyen"
            value={summary.sent}
            tone={summary.sent > 0 ? "caution" : "neutral"}
            hint="mektup gitti, cevap gelmedi"
          />
          <StatTile
            label="Mutabık"
            value={summary.agreed}
            tone="positive"
            hint="müşteri onayladı"
          />
          <StatTile
            label="İtiraz"
            value={summary.disputed}
            tone={summary.disputed > 0 ? "critical" : "neutral"}
            hint="gerekçesiyle birlikte"
          />
          {/* İtiraz edilen tutar: konuşulacak paranın büyüklüğü. Adet tek
              başına "üç itiraz" diyor; üçünün 40 ₺ mi 400.000 ₺ mi olduğu
              işin aciliyetini belirliyor. */}
          <StatTile
            label="İtiraz edilen bakiye"
            value={formatTRY(Number(summary.disputedAmount))}
            hint="konuşulacak tutar"
          />
        </section>
      )}

      <Panel title="Dönem mektubu gönder">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="rec-from">Dönem başı</Label>
            <TextInput
              id="rec-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="rec-to">Dönem sonu</Label>
            <TextInput
              id="rec-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="pb-2.5">
            <Checkbox
              checked={includeZero}
              onChange={(e) => setIncludeZero(e.target.checked)}
              label="Bakiyesi sıfır olanlara da gönder"
            />
          </div>
          <Button
            loading={send.isPending}
            onClick={() => {
              if (
                confirm(
                  `${day(`${from}T00:00:00`)} – ${day(`${to}T00:00:00`)} dönemi için mutabakat mektupları gönderilecek. Onaylıyor musunuz?`,
                )
              ) {
                send.mutate();
              }
            }}
          >
            Gönder
          </Button>
        </div>
        <p className="mt-3 text-body-sm text-ink-muted">
          Aynı döneme <strong>ikinci mektup gitmiyor</strong>: açık mutabakatı
          olan firma atlanıyor. Yeniden göndermek için önce mevcut mektubu geri
          çekin.
        </p>
        <ErrorLine error={send.error} />
      </Panel>

      <Panel
        title="Mutabakatlar"
        bodyClassName="p-0"
        action={
          <Chips
            value={status}
            onChange={(durum) => filters.set({ durum })}
            items={STATUS_FILTERS}
          />
        }
      >
        {query.isLoading && (
          <div className="px-4">
            <LoadingState />
          </div>
        )}
        <div className="px-4">
          <ErrorLine error={query.error ?? cancel.error} />
        </div>

        <Table stickyHead>
          <THead>
            <tr>
              <Th>Dönem</Th>
              <Th>Firma</Th>
              <Th align="right">Mektuptaki bakiye</Th>
              <Th align="right">Bugünkü</Th>
              <Th>Cevap</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 && query.isSuccess && (
              <TableEmpty
                colSpan={6}
                label={
                  status === "SENT"
                    ? "Cevap bekleyen mutabakat yok."
                    : "Bu durumda kayıt yok."
                }
              />
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap" muted>
                  {day(r.periodStart)} – {day(r.periodEnd)}
                </Td>
                <Td>
                  <Link
                    href={`/admin/companies/${r.companyId}/statement`}
                    className="font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {r.companyName}
                  </Link>
                </Td>
                <Td align="right" numeric className="font-medium text-ink">
                  {formatTRY(Number(r.balance))}
                </Td>
                {/* Bugünkü bakiye mektuptakinden farklı olabilir ve bu doğal:
                    defter işlemeye devam ediyor. İkisini yan yana koymak,
                    "bu mektup ne kadar eski" sorusunu cevapsız bırakmıyor. */}
                <Td
                  align="right"
                  numeric
                  muted={r.balance === r.currentBalance}
                >
                  {formatTRY(Number(r.currentBalance))}
                </Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[r.status]}>
                      {RECONCILIATION_STATUS_LABELS[r.status]}
                    </Badge>
                    {r.respondedByName && (
                      <span className="text-xs text-ink-faint">
                        {r.respondedByName}
                        {r.respondedAt ? ` · ${day(r.respondedAt)}` : ""}
                      </span>
                    )}
                    {r.responseNote && (
                      <span className="text-xs text-ink-muted">
                        “{r.responseNote}”
                      </span>
                    )}
                  </span>
                </Td>
                <Td align="right">
                  {r.status === "SENT" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={cancel.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `${r.companyName} için gönderilen mutabakat geri çekilsin mi?`,
                          )
                        ) {
                          cancel.mutate(r.id);
                        }
                      }}
                    >
                      Geri çek
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}
