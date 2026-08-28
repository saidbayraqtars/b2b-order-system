"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CashAccountRow,
  CashMovementRow,
  MethodBinding,
} from "@repo/services";
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
import {
  Badge,
  LoadingState,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { ShowMore, useVisibleSlice } from "@/components/show-more";

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

  // Defter uzun ve okunacak yeri baştır; ekran elli satırda kesiliyor. Sunucu
  // sınırı ayrı bir şey (bkz. /api/admin/cash-movements) — buradaki kesme
  // yalnızca çizim ve sayaç toplamı söylüyor.
  const page = useVisibleSlice(movements.data?.movements ?? [], 50);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["cash-movements"] });
    void qc.invalidateQueries({ queryKey: ["cash-accounts"] });
    void qc.invalidateQueries({ queryKey: ["cash-summary"] });
  };

  const openAccounts = (accounts.data?.accounts ?? []).filter(
    (a) => a.isActive,
  );

  return (
    <Panel
      title="Kasa hareketleri"
      bodyClassName="p-0"
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
              onChange={(e) =>
                setSource(e.target.value as CashMovementSource | "")
              }
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
      <div className="grid gap-4 border-b border-line bg-sunken p-4 md:grid-cols-2">
        <ManualEntryForm accounts={openAccounts} onDone={refresh} />
        <TransferForm accounts={openAccounts} onDone={refresh} />
      </div>

      {movements.isLoading && (
        <div className="px-4">
          <LoadingState />
        </div>
      )}
      {movements.error ? (
        <div className="px-4 pb-4">
          <ErrorLine error={movements.error} />
        </div>
      ) : null}

      {movements.data && (
        <>
          <Table stickyHead>
            <THead>
              <tr>
                <Th>Tarih</Th>
                <Th>Hesap</Th>
                <Th>Kaynak</Th>
                <Th>Açıklama</Th>
                <Th align="right">Tutar</Th>
                <Th> </Th>
              </tr>
            </THead>
            <TBody>
              {page.visible.map((m) => (
                <MovementRow key={m.id} movement={m} onChanged={refresh} />
              ))}
              {page.total === 0 && (
                <TableEmpty colSpan={6} label="Bu filtrede hareket yok." />
              )}
            </TBody>
          </Table>
          <ShowMore
            visible={page.visible.length}
            total={page.total}
            hidden={page.hidden}
            onMore={page.showMore}
            noun="hareket"
          />
        </>
      )}
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
  const color = movement.direction === "IN" ? "text-positive" : "text-critical";

  return (
    <>
      <tr>
        <Td className="whitespace-nowrap text-xs text-ink-faint">
          {new Date(movement.occurredAt).toLocaleString("tr-TR")}
        </Td>
        <Td>{movement.accountName}</Td>
        <Td>
          <div className="flex flex-wrap gap-1">
            <Badge tone="neutral">
              {CASH_MOVEMENT_SOURCE_LABELS[movement.source]}
            </Badge>
            {movement.reversedById && <Badge tone="danger">İptal edildi</Badge>}
            {movement.reversalOfId && <Badge tone="warning">İptal kaydı</Badge>}
          </div>
        </Td>
        <Td muted>
          {movement.description ?? "—"}
          {movement.recordedByName ? ` · ${movement.recordedByName}` : ""}
        </Td>
        <Td align="right" numeric className={`font-medium ${color}`}>
          {sign}
          {formatTRY(movement.amount)}
        </Td>
        <Td align="right">
          {canReverse && !asking && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAsking(true)}
            >
              İptal
            </Button>
          )}
        </Td>
      </tr>

      {/* Gerekçe satırın altında soruluyor: hücreye sıkıştırılan bir kutu
          tablodaki bütün sütunları genişletirdi. */}
      {asking && (
        <tr>
          <Td colSpan={6} className="bg-sunken">
            <div className="flex flex-wrap items-end gap-2">
              <TextInput
                size="sm"
                value={reason}
                placeholder="İptal gerekçesi"
                onChange={(e) => setReason(e.target.value)}
                className="w-64"
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAsking(false)}
              >
                Vazgeç
              </Button>
            </div>
            <ErrorLine error={reverse.error} />
          </Td>
        </tr>
      )}
    </>
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
    <div className="rounded-lg border border-line p-3">
      <h3 className="tech-label mb-2">Elle giriş / çıkış</h3>
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
    fromAccountId !== "" &&
    toAccountId !== "" &&
    fromAccountId !== toAccountId &&
    Number(amount) > 0;

  return (
    <div className="rounded-lg border border-line p-3">
      <h3 className="tech-label mb-2">Hesaplar arası aktarım</h3>
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
