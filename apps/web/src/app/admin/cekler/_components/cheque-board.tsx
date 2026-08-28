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
import { useUrlState } from "@/lib/url-state";
import { formatTRY } from "@/lib/format";
import {
  Badge,
  Card,
  Chips,
  EmptyState,
  LoadingState,
  StatTile,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Modal,
  Panel,
  Select,
  TextInput,
  WarnLine,
} from "@/components/form";

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

const STATUS_TONE: Record<
  ChequeStatus,
  "neutral" | "success" | "warning" | "danger"
> = {
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

/** "Elimizde" gerçek bir durum değil, iki durumun toplamı — bu yüzden başta. */
const STATUS_FILTERS: ReadonlyArray<{
  key: "OPEN" | ChequeStatus;
  label: string;
}> = [
  { key: "OPEN", label: "Elimizde" },
  ...ChequeStatusEnum.options.map((s) => ({
    key: s,
    label: CHEQUE_STATUS_LABELS[s],
  })),
];

function trDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("tr-TR") : "—";
}

/** Vadeye kalan gün; geçmişse negatif. */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

/** Süzgeç varsayılanları — modül düzeyinde, `useUrlState` kimlik bekliyor. */
const FILTER_DEFAULTS = { durum: "OPEN", vadesi: "" };

export function ChequeBoard({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient();
  const filters = useUrlState(FILTER_DEFAULTS);
  const statusFilter = filters.value.durum as "OPEN" | ChequeStatus;
  const overdueOnly = filters.value.vadesi === "gecmis";
  const [acting, setActing] = useState<{
    row: ChequeRow;
    to: ChequeStatus;
  } | null>(null);
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
          <StatTile
            label="Portföyde"
            value={formatTRY(summary.openTotal)}
            hint={`${summary.openCount} kâğıt`}
          />
          <StatTile
            label="Vadesi geçmiş"
            value={formatTRY(summary.overdueTotal)}
            hint={`${summary.overdueCount} kâğıt`}
            tone={summary.overdueCount > 0 ? "critical" : "neutral"}
          />
          <StatTile
            label="30 gün içinde"
            value={formatTRY(summary.dueSoonTotal)}
            hint={`${summary.dueSoonCount} kâğıt`}
            tone={summary.dueSoonCount > 0 ? "caution" : "neutral"}
          />
          <StatTile
            label="Vadesi girilmemiş"
            value={summary.incompleteCount}
            hint="künye eksik"
            tone={summary.incompleteCount > 0 ? "caution" : "neutral"}
          />
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Chips
            value={statusFilter}
            onChange={(durum) => filters.set({ durum })}
            items={STATUS_FILTERS}
          />
          <Checkbox
            checked={overdueOnly}
            onChange={(e) =>
              filters.set({ vadesi: e.target.checked ? "gecmis" : "" })
            }
            label="Yalnızca vadesi geçmiş"
          />
        </div>
      </Card>

      <ErrorLine error={error ? new Error(error) : null} />

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          label={
            filters.isFiltered
              ? "Bu süzgeçle kâğıt yok."
              : "Portföyde çek/senet yok — kâğıt, tahsilat ekranından “çek” yöntemiyle giriliyor."
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
        <Panel title="Kâğıtlar" bodyClassName="p-0">
          <Table>
            <THead>
              <tr>
                <Th>Vade</Th>
                <Th>Firma</Th>
                <Th>Künye</Th>
                <Th align="right">Tutar</Th>
                <Th>Durum</Th>
                <Th>İşlem</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const left = daysLeft(r.dueDate);
                return (
                  <tr key={r.id} className="align-top">
                    <Td className="whitespace-nowrap">
                      <div
                        className={
                          r.isOverdue ? "font-semibold text-critical" : ""
                        }
                      >
                        {trDate(r.dueDate)}
                      </div>
                      {left !== null &&
                      (r.status === "PORTFOLIO" || r.status === "DEPOSITED") ? (
                        <div className="text-xs text-ink-faint">
                          {left < 0
                            ? `${-left} gün geçti`
                            : `${left} gün kaldı`}
                        </div>
                      ) : null}
                      {r.isIncomplete ? (
                        <Badge tone="warning">vade girilmemiş</Badge>
                      ) : null}
                    </Td>
                    <Td>{r.companyName}</Td>
                    <Td muted>
                      <div>
                        {CHEQUE_KIND_LABELS[r.kind]}
                        {r.serialNumber ? ` · ${r.serialNumber}` : ""}
                      </div>
                      {r.bankName ? <div>{r.bankName}</div> : null}
                      {r.drawerName ? (
                        <div>Keşideci: {r.drawerName}</div>
                      ) : null}
                      {r.endorsedTo ? <div>Ciro: {r.endorsedTo}</div> : null}
                      {r.cashAccountName ? (
                        <div>Hesap: {r.cashAccountName}</div>
                      ) : null}
                    </Td>
                    <Td align="right" numeric className="font-medium">
                      {formatTRY(r.amount)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[r.status]}>
                        {CHEQUE_STATUS_LABELS[r.status]}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {/* Tahsil, kâğıdın gitmesi istenen yer — altı eşit
                            ağırlıkta düğmenin arasında hangisinin mutlu yol
                            olduğu görünmüyordu. */}
                        {CHEQUE_TRANSITIONS[r.status].map((to) => (
                          <Button
                            key={to}
                            variant={to === "CLEARED" ? "primary" : "secondary"}
                            size="sm"
                            onClick={() => {
                              setError(null);
                              setActing({ row: r, to });
                            }}
                          >
                            {ACTION_LABELS[to]}
                          </Button>
                        ))}
                        {/* Künye bir durum geçişi değil, düzeltme — geçişlerle
                            aynı ağırlıkta durmamalı. */}
                        {r.status === "PORTFOLIO" ||
                        r.status === "DEPOSITED" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setError(null);
                              setEditing(r);
                            }}
                          >
                            Künye
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        </Panel>
      )}

      {acting ? (
        <ActionDialog
          row={acting.row}
          to={acting.to}
          accounts={accounts}
          busy={advance.isPending}
          onCancel={() => setActing(null)}
          onSubmit={(v) =>
            advance.mutate({ id: acting.row.id, status: acting.to, ...v })
          }
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
    <Modal title={ACTION_LABELS[to]} onClose={onCancel}>
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
        <p className="text-body-sm text-ink-muted">
          {row.companyName} · {formatTRY(row.amount)} ·{" "}
          {CHEQUE_KIND_LABELS[row.kind]}
          {row.serialNumber ? ` ${row.serialNumber}` : ""}
        </p>

        {to === "CLEARED" ? (
          <div>
            <Label htmlFor="cheque-account">Para hangi hesaba girdi</Label>
            <Select
              id="cheque-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {to === "ENDORSED" ? (
          <div>
            <Label htmlFor="cheque-endorsed">Kime ciro edildi</Label>
            <TextInput
              id="cheque-endorsed"
              value={endorsedTo}
              onChange={(e) => setEndorsedTo(e.target.value)}
              required
              placeholder="Tedarikçi adı"
            />
          </div>
        ) : null}

        {reopensDebt ? (
          <WarnLine>
            <span>
              Bu işlem {formatTRY(row.amount)} tutarında borcu{" "}
              <b>cariye geri yazar</b>. Tahsilat kaydı silinmez; ekstrede her
              iki satır da görünür.
            </span>
          </WarnLine>
        ) : null}

        <div>
          <Label htmlFor="cheque-note" hint="isteğe bağlı">
            Not
          </Label>
          <TextInput
            id="cheque-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button type="submit" loading={busy}>
            Onayla
          </Button>
        </div>
      </form>
    </Modal>
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
  const [dueDate, setDue] = useState(
    row.dueDate ? row.dueDate.slice(0, 10) : "",
  );
  const [notes, setNotes] = useState(row.notes ?? "");

  return (
    <Modal title="Künye" onClose={onCancel}>
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
        <p className="text-body-sm text-ink-muted">
          {row.companyName} · {formatTRY(row.amount)}
        </p>

        <div>
          <Label htmlFor="cheque-due">Vade</Label>
          <TextInput
            id="cheque-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="cheque-serial">Seri no</Label>
            <TextInput
              id="cheque-serial"
              value={serialNumber}
              onChange={(e) => setSerial(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cheque-bank">Banka</Label>
            <TextInput
              id="cheque-bank"
              value={bankName}
              onChange={(e) => setBank(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cheque-branch">Şube</Label>
            <TextInput
              id="cheque-branch"
              value={branchName}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cheque-drawer">Keşideci</Label>
            <TextInput
              id="cheque-drawer"
              value={drawerName}
              onChange={(e) => setDrawer(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cheque-notes">Not</Label>
          <TextInput
            id="cheque-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button type="submit" loading={busy}>
            Kaydet
          </Button>
        </div>
      </form>
    </Modal>
  );
}
