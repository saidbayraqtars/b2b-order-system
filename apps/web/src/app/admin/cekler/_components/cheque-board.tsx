"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CHEQUE_KIND_LABELS,
  CHEQUE_STATUS_LABELS,
  CHEQUE_TRANSITIONS,
  ChequeStatusEnum,
  type ChequeKind,
  type ChequeStatus,
} from "@repo/types";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";

// Çek/senet portföyü ekranı.
//
// Ekranın tek sorusu **"sırada ne var"**: vadesi geçmiş ve yaklaşan kâğıtlar
// üstte, kapananlar aşağıda. Bu yüzden varsayılan süzgeç "elimizde olanlar" —
// tahsil edilmiş bir çek listeyi doldurup vadesi yaklaşanı gözden kaçırmamalı.

interface Account {
  id: string;
  name: string;
  kind: string;
}

interface ChequeRow {
  id: string;
  kind: ChequeKind;
  status: ChequeStatus;
  companyId: string;
  companyName: string;
  amount: string;
  serialNumber: string | null;
  bankName: string | null;
  branchName: string | null;
  drawerName: string | null;
  dueDate: string | null;
  notes: string | null;
  endorsedTo: string | null;
  cashAccountName: string | null;
  settledAt: string | null;
  createdAt: string;
  isOverdue: boolean;
  isIncomplete: boolean;
}

interface Summary {
  openTotal: string;
  openCount: number;
  overdueTotal: string;
  overdueCount: number;
  dueSoonTotal: string;
  dueSoonCount: number;
  incompleteCount: number;
  byStatus: Array<{ status: ChequeStatus; count: number; total: string }>;
}

const STATUS_TONE: Record<ChequeStatus, "neutral" | "success" | "warning" | "danger"> = {
  PORTFOLIO: "neutral",
  DEPOSITED: "warning",
  CLEARED: "success",
  BOUNCED: "danger",
  ENDORSED: "neutral",
  RETURNED: "danger",
  CANCELLED: "neutral",
};

/** Durum düğmesinin üstünde yazan fiil — "CLEARED" değil, "Tahsil edildi". */
const ACTION_LABELS: Record<ChequeStatus, string> = {
  PORTFOLIO: "Portföye geri al",
  DEPOSITED: "Tahsile ver",
  CLEARED: "Tahsil edildi",
  BOUNCED: "Karşılıksız",
  ENDORSED: "Ciro et",
  RETURNED: "Müşteriye iade",
  CANCELLED: "İptal",
};

function trDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("tr-TR") : "—";
}

/** Vadeye kalan gün; geçmişse negatif. */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export function ChequeBoard({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"OPEN" | ChequeStatus>("OPEN");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [acting, setActing] = useState<{ row: ChequeRow; to: ChequeStatus } | null>(
    null,
  );
  const [editing, setEditing] = useState<ChequeRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (statusFilter !== "OPEN") params.set("status", statusFilter);
  if (overdueOnly) params.set("overdue", "1");
  const qs = params.toString();

  const { data, isLoading } = useQuery({
    queryKey: ["cheques", qs],
    queryFn: () =>
      apiGet<{ cheques: ChequeRow[]; summary: Summary }>(
        `/api/cheques${qs ? `?${qs}` : ""}`,
      ),
  });

  const advance = useMutation({
    mutationFn: (input: {
      id: string;
      status: ChequeStatus;
      cashAccountId?: string | null;
      endorsedTo?: string;
      note?: string;
    }) => apiPost(`/api/cheques/${input.id}`, input),
    onSuccess: () => {
      setActing(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["cheques"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const saveDetails = useMutation({
    mutationFn: (input: { id: string } & Record<string, unknown>) =>
      apiPatch(`/api/cheques/${input.id}`, input),
    onSuccess: () => {
      setEditing(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["cheques"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows = (data?.cheques ?? []).filter((r) =>
    statusFilter === "OPEN"
      ? r.status === "PORTFOLIO" || r.status === "DEPOSITED"
      : true,
  );
  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Portföyde"
            value={formatTRY(summary.openTotal)}
            note={`${summary.openCount} kâğıt`}
          />
          <Stat
            label="Vadesi geçmiş"
            value={formatTRY(summary.overdueTotal)}
            note={`${summary.overdueCount} kâğıt`}
            tone={summary.overdueCount > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="30 gün içinde"
            value={formatTRY(summary.dueSoonTotal)}
            note={`${summary.dueSoonCount} kâğıt`}
            tone={summary.dueSoonCount > 0 ? "warning" : "neutral"}
          />
          <Stat
            label="Vadesi girilmemiş"
            value={String(summary.incompleteCount)}
            note="künye eksik"
            tone={summary.incompleteCount > 0 ? "warning" : "neutral"}
          />
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={statusFilter === "OPEN"}
            onClick={() => setStatusFilter("OPEN")}
            label="Elimizde"
          />
          {ChequeStatusEnum.options.map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              label={CHEQUE_STATUS_LABELS[s]}
            />
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            Yalnızca vadesi geçmiş
          </label>
        </div>
      </Card>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState label="Bu süzgeçle kâğıt yok." />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Vade</th>
                  <th className="px-3 py-2">Firma</th>
                  <th className="px-3 py-2">Künye</th>
                  <th className="px-3 py-2 text-right">Tutar</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const left = daysLeft(r.dueDate);
                  return (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="whitespace-nowrap px-3 py-2">
                        <div
                          className={
                            r.isOverdue ? "font-semibold text-red-600" : ""
                          }
                        >
                          {trDate(r.dueDate)}
                        </div>
                        {left !== null &&
                        (r.status === "PORTFOLIO" || r.status === "DEPOSITED") ? (
                          <div className="text-xs text-neutral-500">
                            {left < 0 ? `${-left} gün geçti` : `${left} gün kaldı`}
                          </div>
                        ) : null}
                        {r.isIncomplete ? (
                          <Badge tone="warning">vade girilmemiş</Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{r.companyName}</td>
                      <td className="px-3 py-2 text-xs text-neutral-600">
                        <div>
                          {CHEQUE_KIND_LABELS[r.kind]}
                          {r.serialNumber ? ` · ${r.serialNumber}` : ""}
                        </div>
                        {r.bankName ? <div>{r.bankName}</div> : null}
                        {r.drawerName ? <div>Keşideci: {r.drawerName}</div> : null}
                        {r.endorsedTo ? <div>Ciro: {r.endorsedTo}</div> : null}
                        {r.cashAccountName ? (
                          <div>Hesap: {r.cashAccountName}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatTRY(r.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS_TONE[r.status]}>
                          {CHEQUE_STATUS_LABELS[r.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {CHEQUE_TRANSITIONS[r.status].map((to) => (
                            <button
                              key={to}
                              type="button"
                              onClick={() => {
                                setError(null);
                                setActing({ row: r, to });
                              }}
                              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                            >
                              {ACTION_LABELS[to]}
                            </button>
                          ))}
                          {r.status === "PORTFOLIO" || r.status === "DEPOSITED" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setError(null);
                                setEditing(r);
                              }}
                              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                            >
                              Künye
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {acting ? (
        <ActionDialog
          row={acting.row}
          to={acting.to}
          accounts={accounts}
          busy={advance.isPending}
          onCancel={() => setActing(null)}
          onSubmit={(v) => advance.mutate({ id: acting.row.id, status: acting.to, ...v })}
        />
      ) : null}

      {editing ? (
        <DetailsDialog
          row={editing}
          busy={saveDetails.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => saveDetails.mutate({ id: editing.id, ...v })}
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-red-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-neutral-900 dark:text-neutral-100";
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-neutral-500">{note}</div>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs ${
        active
          ? "bg-brand-600 text-white"
          : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Durum değişikliği penceresi.
 *
 * Her geçiş aynı soruları sormuyor: tahsilde hesap gerekiyor, ciroda karşı
 * taraf. Karşılıksız ve iade uyarı gösteriyor çünkü ikisi de **cariye borç
 * yazıyor** — operatör bunu bilmeden tıklamamalı.
 */
function ActionDialog({
  row,
  to,
  accounts,
  busy,
  onCancel,
  onSubmit,
}: {
  row: ChequeRow;
  to: ChequeStatus;
  accounts: Account[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: {
    cashAccountId?: string | null;
    endorsedTo?: string;
    note?: string;
  }) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [endorsedTo, setEndorsedTo] = useState("");
  const [note, setNote] = useState("");

  const reopensDebt = to === "BOUNCED" || to === "RETURNED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              ...(to === "CLEARED" ? { cashAccountId: accountId || null } : {}),
              ...(to === "ENDORSED" ? { endorsedTo } : {}),
              ...(note.trim() ? { note } : {}),
            });
          }}
        >
          <h2 className="text-base font-semibold">{ACTION_LABELS[to]}</h2>
          <p className="text-sm text-neutral-600">
            {row.companyName} · {formatTRY(row.amount)} ·{" "}
            {CHEQUE_KIND_LABELS[row.kind]}
            {row.serialNumber ? ` ${row.serialNumber}` : ""}
          </p>

          {to === "CLEARED" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Para hangi hesaba girdi</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {to === "ENDORSED" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Kime ciro edildi</span>
              <input
                value={endorsedTo}
                onChange={(e) => setEndorsedTo(e.target.value)}
                required
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
                placeholder="Tedarikçi adı"
              />
            </label>
          ) : null}

          {reopensDebt ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Bu işlem {formatTRY(row.amount)} tutarında borcu <b>cariye geri
              yazar</b>. Tahsilat kaydı silinmez; ekstrede her iki satır da görünür.
            </p>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Not (isteğe bağlı)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {busy ? "Kaydediliyor…" : "Onayla"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/** Sahadan eksik gelen künyeyi ofiste tamamlamak için. Tutar burada yok. */
function DetailsDialog({
  row,
  busy,
  onCancel,
  onSubmit,
}: {
  row: ChequeRow;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: Record<string, unknown>) => void;
}) {
  const [serialNumber, setSerial] = useState(row.serialNumber ?? "");
  const [bankName, setBank] = useState(row.bankName ?? "");
  const [branchName, setBranch] = useState(row.branchName ?? "");
  const [drawerName, setDrawer] = useState(row.drawerName ?? "");
  const [dueDate, setDue] = useState(row.dueDate ? row.dueDate.slice(0, 10) : "");
  const [notes, setNotes] = useState(row.notes ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              serialNumber,
              bankName,
              branchName,
              drawerName,
              notes,
              ...(dueDate ? { dueDate } : {}),
            });
          }}
        >
          <h2 className="text-base font-semibold">Künye</h2>
          <p className="text-sm text-neutral-600">
            {row.companyName} · {formatTRY(row.amount)}
          </p>

          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Vade</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDue(e.target.value)}
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Seri no</span>
              <input
                value={serialNumber}
                onChange={(e) => setSerial(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Banka</span>
              <input
                value={bankName}
                onChange={(e) => setBank(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Şube</span>
              <input
                value={branchName}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Keşideci</span>
              <input
                value={drawerName}
                onChange={(e) => setDrawer(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Not</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
