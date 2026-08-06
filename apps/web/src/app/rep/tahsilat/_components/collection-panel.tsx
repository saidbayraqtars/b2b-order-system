"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Wallet } from "lucide-react";
import type { PaymentRecord, RecordPaymentResult } from "@repo/services";
import {
  COLLECTION_METHOD_LABELS,
  COLLECTION_METHOD_SETTLES,
  CollectionMethodEnum,
  type CashAccountKind,
  type CollectionMethod,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompanyOption } from "@/components/storefront/company-switcher";
import { Button, ErrorLine, Label, Panel, Select, TextInput } from "@/components/form";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";

const METHODS = CollectionMethodEnum.options;

interface AccountOption {
  id: string;
  name: string;
  kind: CashAccountKind;
  isDefault: boolean;
}

/**
 * Tahsilat girişi + o firmanın son tahsilatları.
 *
 * İki karar burada görünür:
 *  - **Onay adımı var.** Tutar yazılıp "Kaydet" denince önce ne kadarın hangi
 *    cariye işleneceği ve bakiyenin ne olacağı büyük puntoyla gösterilir. Çift
 *    tıklama ve fazladan bir sıfır, bu ekranda en pahalı iki hatadır.
 *  - **Liste ofisin girdiklerini de gösterir.** Plasiyer yalnızca kendi
 *    kayıtlarını görseydi, merkezden işlenmiş bir ödemeyi ikinci kez isterdi.
 */
export function CollectionPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<CollectionMethod>("CASH");
  const [description, setDescription] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const companies = useQuery({
    queryKey: ["orderable-companies"],
    queryFn: () => apiGet<{ companies: CompanyOption[] }>("/api/companies"),
    staleTime: 60_000,
  });
  const company = companies.data?.companies.find((c) => c.id === companyId);

  // Hangi kasaya girdiği yalnızca harcanabilir para için sorulur: çek ve senet
  // cariyi kapatır ama tahsil edilene kadar kasaya girmez.
  const settles = COLLECTION_METHOD_SETTLES[method];
  const accounts = useQuery({
    queryKey: ["cash-accounts-picker"],
    queryFn: () => apiGet<{ accounts: AccountOption[] }>("/api/cash-accounts"),
    staleTime: 300_000,
  });
  const accountOptions = accounts.data?.accounts ?? [];

  const payments = useQuery({
    queryKey: ["payments", companyId],
    queryFn: () =>
      apiGet<{ payments: PaymentRecord[] }>(
        `/api/payments?companyId=${encodeURIComponent(companyId)}`,
      ),
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["payments", companyId] });
    // Bakiye ve kullanılabilir limit değişti; firma listesi ile üstteki seçici
    // de tazelenmeli, yoksa ekranda eski bakiye kalır.
    void qc.invalidateQueries({ queryKey: ["orderable-companies"] });
    void qc.invalidateQueries({ queryKey: ["statement", companyId] });
  }

  const record = useMutation({
    mutationFn: (body: {
      companyId: string;
      amount: number;
      collectionMethod: CollectionMethod;
      description?: string;
      cashAccountId?: string;
    }) => apiPost<RecordPaymentResult>("/api/payments", body),
    onSuccess: () => {
      setAmount("");
      setDescription("");
      setConfirming(false);
      refresh();
    },
  });

  // Türkçe klavye virgül üretir, API sayı bekler.
  const parsed = useMemo(() => Number(amount.replace(",", ".")), [amount]);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const balance = company ? Number(company.currentBalance) : null;
  const afterBalance = balance === null || !valid ? null : balance - parsed;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Firma" value={companyName} />
        <Stat
          label="Güncel bakiye"
          value={company ? formatTRY(company.currentBalance) : "…"}
          danger={balance !== null && balance > 0}
        />
        <Stat
          label="Kullanılabilir limit"
          value={company ? formatTRY(company.availableCredit) : "…"}
          danger={company ? Number(company.availableCredit) < 0 : false}
        />
      </section>

      <Panel title="Tahsilat gir">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="tahsilat-tutar">Tutar</Label>
            <TextInput
              id="tahsilat-tutar"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setConfirming(false);
              }}
            />
          </div>
          <div>
            <Label htmlFor="tahsilat-aciklama" hint="(opsiyonel)">
              Açıklama
            </Label>
            <TextInput
              id="tahsilat-aciklama"
              placeholder="Örn. 12 no'lu makbuz"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <Label>Tahsilat şekli</Label>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === method}
                onClick={() => setMethod(m)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  m === method
                    ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400",
                )}
              >
                {COLLECTION_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {settles ? (
          <div className="mt-4 sm:max-w-xs">
            <Label htmlFor="tahsilat-kasa" hint="(boş bırakılırsa varsayılan)">
              Hangi kasaya girdi?
            </Label>
            <Select
              id="tahsilat-kasa"
              value={cashAccountId}
              onChange={(e) => setCashAccountId(e.target.value)}
            >
              <option value="">Varsayılan kasa</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <p className="mt-4 text-xs text-neutral-500">
            {COLLECTION_METHOD_LABELS[method]} carinin borcunu kapatır, ancak
            tahsil edilene kadar kasaya girmez — kasa bakiyesi değişmez.
          </p>
        )}

        {confirming && valid ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              <span className="font-semibold">{companyName}</span> carisine{" "}
              <span className="text-base font-bold tabular-nums">
                {formatTRY(parsed)}
              </span>{" "}
              {COLLECTION_METHOD_LABELS[method].toLocaleLowerCase("tr")} tahsilat
              işlenecek.
            </p>
            {afterBalance !== null && (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Bakiye {formatTRY(balance!)} → {formatTRY(afterBalance)}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                variant="success"
                loading={record.isPending}
                onClick={() =>
                  record.mutate({
                    companyId,
                    amount: parsed,
                    collectionMethod: method,
                    description: description.trim() || undefined,
                    cashAccountId:
                      settles && cashAccountId ? cashAccountId : undefined,
                  })
                }
              >
                Onaylıyorum, kaydet
              </Button>
              <Button
                variant="secondary"
                disabled={record.isPending}
                onClick={() => setConfirming(false)}
              >
                Vazgeç
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Button disabled={!valid} onClick={() => setConfirming(true)}>
              <Wallet className="h-4 w-4" />
              Tahsilatı kaydet
            </Button>
          </div>
        )}

        <ErrorLine error={record.error} />
      </Panel>

      <Panel title="Bu firmanın son tahsilatları">
        {payments.isLoading ? (
          <LoadingState />
        ) : payments.isError ? (
          <ErrorLine error={payments.error} />
        ) : payments.data!.payments.length === 0 ? (
          <EmptyState label="Henüz tahsilat kaydı yok." />
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {payments.data!.payments.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                companyId={companyId}
                onReversed={refresh}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/**
 * Tek tahsilat satırı + iptal.
 *
 * İptal silmez: aynı tutarda ters bir borç kaydı yazar ve ikisi de ekstrede
 * kalır. Bu yüzden gerekçe zorunlu — ekstreyi okuyan kişi "neden" sorusunun
 * cevabını satırın kendisinde bulmalı.
 */
function PaymentRow({
  payment,
  companyId,
  onReversed,
}: {
  payment: PaymentRecord;
  companyId: string;
  onReversed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const reverse = useMutation({
    mutationFn: () =>
      apiPost(`/api/payments/${payment.id}/reverse`, {
        companyId,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      onReversed();
    },
  });

  const reversed = Boolean(payment.reversedById);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className={cn("tabular-nums", reversed && "line-through opacity-60")}>
              {formatTRY(payment.amount)}
            </span>
            {payment.collectionMethod && (
              <Badge tone={reversed ? "neutral" : "success"}>
                {COLLECTION_METHOD_LABELS[payment.collectionMethod]}
              </Badge>
            )}
            {reversed && <Badge tone="danger">İptal edildi</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {new Date(payment.createdAt).toLocaleString("tr-TR")}
            {payment.recordedByName ? ` · ${payment.recordedByName}` : ""}
            {payment.description ? ` · ${payment.description}` : ""}
          </p>
        </div>
        {!reversed && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            <RotateCcw className="h-3.5 w-3.5" />
            İptal
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <Label htmlFor={`iptal-${payment.id}`}>
            İptal gerekçesi
          </Label>
          <TextInput
            id={`iptal-${payment.id}`}
            autoFocus
            placeholder="Örn. tutar yanlış girildi"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-neutral-500">
            Kayıt silinmez; aynı tutarda ters bir borç kaydı yazılır ve ikisi de
            ekstrede görünür.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={reason.trim().length < 3}
              loading={reverse.isPending}
              onClick={() => reverse.mutate()}
            >
              Tahsilatı iptal et
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={reverse.isPending}
              onClick={() => setOpen(false)}
            >
              Vazgeç
            </Button>
          </div>
          <ErrorLine error={reverse.error} />
        </div>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <Card>
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-lg font-semibold tabular-nums",
          danger
            ? "text-red-600 dark:text-red-400"
            : "text-neutral-900 dark:text-neutral-50",
        )}
      >
        {value}
      </p>
    </Card>
  );
}
