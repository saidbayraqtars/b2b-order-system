"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CashAccountRow, CashMovementRow, MethodBinding } from "@repo/services";
import {
  CASH_MOVEMENT_SOURCE_LABELS,
  CashMovementSourceEnum,
  type CashDirection,
  type CashMovementSource,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
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

// The till ledger itself: what moved, filters over it, and the two entries a
// human writes by hand — elle giriş/çıkış and hesaplar arası aktarım.
//
// Order and collection entries have no reverse button. Their other half is a
// cari row or an order status, and undoing this half alone would leave the two
// ledgers telling different stories about the same event; they are cancelled
// from the order or the tahsilat, which unwinds both together.

interface AccountsResponse {
  accounts: CashAccountRow[];
  bindings: MethodBinding[];
}

export function MovementsPanel() {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [source, setSource] = useState<CashMovementSource | "">("");

  const accounts = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => apiGet<AccountsResponse>("/api/admin/cash-accounts"),
  });

  const movements = useQuery({
    queryKey: ["cash-movements", accountId, source],
    queryFn: () => {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      if (source) params.set("source", source);
      return apiGet<{ movements: CashMovementRow[] }>(
        `/api/admin/cash-movements?${params.toString()}`,
      );
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["cash-movements"] });
    void qc.invalidateQueries({ queryKey: ["cash-accounts"] });
    void qc.invalidateQueries({ queryKey: ["cash-summary"] });
  };

  const openAccounts = (accounts.data?.accounts ?? []).filter((a) => a.isActive);

  return (
    <Panel
      title="Kasa hareketleri"
      action={
        <div className="flex items-end gap-2">
          <label>
            <Label>Hesap</Label>
            <Select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-40"
            >
              <option value="">Tümü</option>
              {(accounts.data?.accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <Label>Kaynak</Label>
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as CashMovementSource | "")}
              className="w-40"
            >
              <option value="">Tümü</option>
              {CashMovementSourceEnum.options.map((s) => (
                <option key={s} value={s}>
                  {CASH_MOVEMENT_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          </label>
        </div>
      }
    >
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <ManualEntryForm accounts={openAccounts} onDone={refresh} />
        <TransferForm accounts={openAccounts} onDone={refresh} />
      </div>

      {movements.isLoading && <LoadingState />}
      <ErrorLine error={movements.error} />

      {movements.data &&
        (movements.data.movements.length === 0 ? (
          <EmptyState label="Bu filtrede hareket yok." />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {movements.data.movements.map((m) => (
              <MovementRow key={m.id} movement={m} onChanged={refresh} />
            ))}
          </ul>
        ))}
    </Panel>
  );
}

function MovementRow({
  movement,
  onChanged,
}: {
  movement: CashMovementRow;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  const reverse = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/cash-movements/${movement.id}/reverse`, { reason }),
    onSuccess: () => {
      setAsking(false);
      setReason("");
      onChanged();
    },
  });

  const byHand = movement.source === "MANUAL" || movement.source === "TRANSFER";
  const canReverse = byHand && !movement.reversedById && !movement.reversalOfId;
  const sign = movement.direction === "IN" ? "+" : "−";
  const color =
    movement.direction === "IN"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className={color}>
              {sign}
              {formatTRY(movement.amount)}
            </span>
            <Badge tone="neutral">
              {CASH_MOVEMENT_SOURCE_LABELS[movement.source]}
            </Badge>
            {movement.reversedById && <Badge tone="danger">İptal edildi</Badge>}
            {movement.reversalOfId && <Badge tone="warning">İptal kaydı</Badge>}
          </p>
          <p className="text-neutral-500">
            {movement.accountName} ·{" "}
            {new Date(movement.occurredAt).toLocaleString("tr-TR")}
            {movement.description ? ` · ${movement.description}` : ""}
            {movement.recordedByName ? ` · ${movement.recordedByName}` : ""}
          </p>
        </div>

        {canReverse &&
          (asking ? (
            <div className="flex items-end gap-2">
              <TextInput
                value={reason}
                placeholder="İptal gerekçesi"
                onChange={(e) => setReason(e.target.value)}
                className="w-52"
              />
              <Button
                size="sm"
                variant="danger"
                disabled={reason.trim().length === 0}
                loading={reverse.isPending}
                onClick={() => reverse.mutate()}
              >
                İptal et
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                Vazgeç
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
              İptal
            </Button>
          ))}
      </div>
      <ErrorLine error={reverse.error} />
    </li>
  );
}

function ManualEntryForm({
  accounts,
  onDone,
}: {
  accounts: CashAccountRow[];
  onDone: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState<CashDirection>("OUT");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/cash-movements", {
        accountId: accountId || accounts[0]?.id,
        direction,
        amount: Number(amount),
        description: description.trim(),
      }),
    onSuccess: () => {
      setAmount("");
      setDescription("");
      onDone();
    },
  });

  const ready =
    (accountId || accounts[0]) &&
    Number(amount) > 0 &&
    description.trim().length > 0;

  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Elle giriş / çıkış
      </h3>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <Label>Hesap</Label>
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-36"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>Yön</Label>
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as CashDirection)}
            className="w-28"
          >
            <option value="IN">Giriş</option>
            <option value="OUT">Çıkış</option>
          </Select>
        </label>
        <label>
          <Label>Tutar</Label>
          <TextInput
            type="number"
            min={0.01}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28"
          />
        </label>
        <label className="flex-1">
          <Label hint="zorunlu">Açıklama</Label>
          <TextInput
            value={description}
            placeholder="Kira, yakıt, kasa farkı…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <Button
          disabled={!ready}
          loading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          Kaydet
        </Button>
      </div>
      <ErrorLine error={submit.error} />
    </div>
  );
}

function TransferForm({
  accounts,
  onDone,
}: {
  accounts: CashAccountRow[];
  onDone: () => void;
}) {
  const [fromAccountId, setFrom] = useState("");
  const [toAccountId, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/cash-movements/transfer", {
        fromAccountId,
        toAccountId,
        amount: Number(amount),
      }),
    onSuccess: () => {
      setAmount("");
      onDone();
    },
  });

  const ready =
    fromAccountId !== "" && toAccountId !== "" && fromAccountId !== toAccountId && Number(amount) > 0;

  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Hesaplar arası aktarım
      </h3>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <Label>Nereden</Label>
          <Select
            value={fromAccountId}
            onChange={(e) => setFrom(e.target.value)}
            className="w-36"
          >
            <option value="">Seçin</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>Nereye</Label>
          <Select
            value={toAccountId}
            onChange={(e) => setTo(e.target.value)}
            className="w-36"
          >
            <option value="">Seçin</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>Tutar</Label>
          <TextInput
            type="number"
            min={0.01}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28"
          />
        </label>
        <Button
          disabled={!ready}
          loading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          Aktar
        </Button>
      </div>
      <ErrorLine error={submit.error} />
    </div>
  );
}
