"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CashAccountRow, MethodBinding } from "@repo/services";
import {
  CASH_ACCOUNT_KIND_LABELS,
  CashAccountKindEnum,
  PAYMENT_METHOD_LABELS,
  type CashAccountKind,
} from "@repo/types";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { Badge, EmptyState, LoadingState } from "@/components/ui";

// Kasa / banka hesapları and the mapping that decides where a peşin order's
// money lands.
//
// An account with entries can be closed but never deleted: its ledger is the
// record of money that actually moved, and the balance it carries has to keep
// adding up.

interface AccountsResponse {
  accounts: CashAccountRow[];
  bindings: MethodBinding[];
}

interface Draft {
  name: string;
  kind: CashAccountKind;
  bankName: string;
  iban: string;
  openingBalance: string;
}

const EMPTY: Draft = {
  name: "",
  kind: "CASH",
  bankName: "",
  iban: "",
  openingBalance: "",
};

export function AccountsPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const query = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => apiGet<AccountsResponse>("/api/admin/cash-accounts"),
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cash-accounts"] });
    void qc.invalidateQueries({ queryKey: ["cash-summary"] });
  };

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/cash-accounts", {
        name: draft.name.trim(),
        kind: draft.kind,
        bankName: draft.bankName.trim() || undefined,
        iban: draft.iban.trim() || undefined,
        openingBalance: Number(draft.openingBalance || 0),
      }),
    onSuccess: () => {
      setDraft(EMPTY);
      invalidate();
    },
  });

  return (
    <Panel title="Hesaplar" bodyClassName="p-0">
      {/* Hesap açma şeridi gömük zeminde: tablo başlığıyla aynı yüzey,
          altındaki listeden bir çizgiyle ayrılıyor. */}
      <div className="border-b border-line bg-sunken px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <Label>Hesap adı</Label>
            <TextInput
              value={draft.name}
              placeholder="Merkez Kasa, Ziraat TL…"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-44"
            />
          </label>
          <label>
            <Label>Tür</Label>
            <Select
              value={draft.kind}
              onChange={(e) =>
                setDraft({ ...draft, kind: e.target.value as CashAccountKind })
              }
              className="w-40"
            >
              {CashAccountKindEnum.options.map((k) => (
                <option key={k} value={k}>
                  {CASH_ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </label>
          {draft.kind !== "CASH" && (
            <>
              <label>
                <Label>Banka</Label>
                <TextInput
                  value={draft.bankName}
                  onChange={(e) =>
                    setDraft({ ...draft, bankName: e.target.value })
                  }
                  className="w-36"
                />
              </label>
              <label>
                <Label>IBAN</Label>
                <TextInput
                  value={draft.iban}
                  onChange={(e) => setDraft({ ...draft, iban: e.target.value })}
                  className="w-56"
                />
              </label>
            </>
          )}
          <label>
            <Label hint="sistem gelmeden önceki bakiye">Devir</Label>
            <TextInput
              type="number"
              min={0}
              step="0.01"
              value={draft.openingBalance}
              placeholder="0"
              onChange={(e) =>
                setDraft({ ...draft, openingBalance: e.target.value })
              }
              className="w-32"
            />
          </label>
          <Button
            disabled={create.isPending || draft.name.trim().length === 0}
            onClick={() => create.mutate()}
          >
            Hesap aç
          </Button>
        </div>
        <ErrorLine error={create.error} />
      </div>

      <div className="p-4">
        {query.isLoading && <LoadingState />}
        <ErrorLine error={query.error} />

        {query.data && (
          <>
            {query.data.accounts.length === 0 ? (
              <EmptyState label="Hiç hesap yok — peşin siparişlerin parası hiçbir yere yazılamaz." />
            ) : (
              <ul className="space-y-2">
                {query.data.accounts.map((a) => (
                  <AccountRow key={a.id} account={a} onChanged={invalidate} />
                ))}
              </ul>
            )}

            <BindingsEditor
              bindings={query.data.bindings}
              accounts={query.data.accounts.filter((a) => a.isActive)}
              onChanged={invalidate}
            />
          </>
        )}
      </div>
    </Panel>
  );
}

function AccountRow({
  account,
  onChanged,
}: {
  account: CashAccountRow;
  onChanged: () => void;
}) {
  const toggle = useMutation({
    mutationFn: () =>
      apiPatch(`/api/admin/cash-accounts/${account.id}`, {
        isActive: !account.isActive,
      }),
    onSuccess: onChanged,
  });
  const makeDefault = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/cash-accounts/${account.id}/default`, {}),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/cash-accounts/${account.id}`),
    onSuccess: onChanged,
  });

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-body-sm">
          <p className="flex items-center gap-2 font-medium">
            {account.name}
            <Badge tone="info">{CASH_ACCOUNT_KIND_LABELS[account.kind]}</Badge>
            {account.isDefault && <Badge tone="brand">Varsayılan</Badge>}
            {!account.isActive && <Badge tone="neutral">Kapalı</Badge>}
          </p>
          <p className="text-ink-faint">
            Bakiye <strong>{formatTRY(account.currentBalance)}</strong> · devir{" "}
            {formatTRY(account.openingBalance)} · {account.movementCount}{" "}
            hareket
            {account.boundMethods.length > 0 && (
              <>
                {" · "}
                {account.boundMethods
                  .map((m) => PAYMENT_METHOD_LABELS[m])
                  .join(", ")}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!account.isDefault && account.isActive && (
            <Button
              size="sm"
              variant="secondary"
              loading={makeDefault.isPending}
              onClick={() => makeDefault.mutate()}
            >
              Varsayılan yap
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {account.isActive ? "Kapat" : "Aç"}
          </Button>
          {account.movementCount === 0 && !account.isDefault && (
            <Button
              size="sm"
              variant="dangerQuiet"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Sil
            </Button>
          )}
        </div>
      </div>
      <ErrorLine error={toggle.error ?? makeDefault.error ?? remove.error} />
    </li>
  );
}

/**
 * Which account each payment method settles into.
 *
 * Methods that never bring money in — açık hesap, çek — are shown greyed rather
 * than hidden: an operator looking for "kredi kartı nereye giriyor" should be
 * able to see at a glance that the two credit methods are simply not here.
 */
function BindingsEditor({
  bindings,
  accounts,
  onChanged,
}: {
  bindings: MethodBinding[];
  accounts: CashAccountRow[];
  onChanged: () => void;
}) {
  const save = useMutation({
    mutationFn: (input: { method: string; accountId: string | null }) =>
      apiPut("/api/admin/cash-accounts/bindings", input),
    onSuccess: onChanged,
  });

  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="tech-label mb-1">Ödeme yöntemi → hesap</h3>
      <p className="mb-3 text-xs text-ink-faint">
        Peşin bir siparişin parası hangi hesaba yazılsın? Eşlenmemiş yöntem
        varsayılan hesaba düşer.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {bindings.map((b) => (
          <li key={b.method} className="flex items-center gap-2">
            <span
              className={`w-40 shrink-0 text-body-sm ${
                b.settles ? "" : "text-ink-faint"
              }`}
            >
              {PAYMENT_METHOD_LABELS[b.method]}
            </span>
            {b.settles ? (
              <Select
                value={b.accountId ?? ""}
                onChange={(e) =>
                  save.mutate({
                    method: b.method,
                    accountId: e.target.value || null,
                  })
                }
              >
                <option value="">Varsayılan hesap</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-xs text-ink-faint">
                Kasaya girmez — cariye borç yazar
              </span>
            )}
          </li>
        ))}
      </ul>
      <ErrorLine error={save.error} />
    </div>
  );
}
