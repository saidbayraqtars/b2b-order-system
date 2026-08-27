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
  Chips,
  EmptyState,
  LoadingState,
  StatTile,
} from "@/components/ui";

/**
 * Tekrar anahtarı üretici.
 *
 * `crypto.randomUUID` her tarayıcıda yok (eski Android WebView'ları, güvenli
 * bağlam olmayan yerel kurulumlar); saha telefonlarında bunun yokluğu gerçek
 * bir durum. Yedek yol rastgeleliği düşürmüyor çünkü anahtarın gizli olması
 * gerekmiyor — yalnızca aynı formun iki gönderimi arasında **aynı**, iki farklı
 * tahsilat arasında **farklı** olması gerekiyor.
 */
function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const METHODS = CollectionMethodEnum.options;
const METHOD_CHIPS = METHODS.map((m) => ({
  key: m,
  label: COLLECTION_METHOD_LABELS[m],
}));

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

  /**
   * Bu tahsilat girişinin tekrar anahtarı.
   *
   * Onay adımı ve kilitlenen düğme, ağ koptuğunda yeniden gönderen bir istemciyi
   * durdurmuyor — kullanıcı da "kaydedildi mi" bilemediği için tekrar basıyor.
   * Anahtar form doldurulurken bir kez üretiliyor ve kayıt başarılı olunca
   * yenileniyor: aynı formun ikinci gönderimi sunucuda ikinci satır açmıyor,
   * ama *sonraki* tahsilat yeni bir anahtarla gidiyor.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => newKey());

  const record = useMutation({
    mutationFn: (body: {
      companyId: string;
      amount: number;
      collectionMethod: CollectionMethod;
      description?: string;
      cashAccountId?: string;
      idempotencyKey: string;
    }) => apiPost<RecordPaymentResult>("/api/payments", body),
    onSuccess: () => {
      setAmount("");
      setDescription("");
      setConfirming(false);
      setIdempotencyKey(newKey());
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
        {/* Firma adı bir ölçü değil ama şeridin ilk kutusu: ekranın tamamı tek
            bir carinin defterine yazıyor ve hangi cari olduğu her an
            görünmeli. */}
        <StatTile
          label="Firma"
          value={<span className="text-headline-md">{companyName}</span>}
        />
        <StatTile
          label="Güncel bakiye"
          value={company ? formatTRY(company.currentBalance) : "…"}
          tone={balance !== null && balance > 0 ? "critical" : "neutral"}
          hint={balance !== null && balance > 0 ? "borçlu" : undefined}
        />
        <StatTile
          label="Kullanılabilir limit"
          value={company ? formatTRY(company.availableCredit) : "…"}
          tone={
            company && Number(company.availableCredit) < 0
              ? "critical"
              : "neutral"
          }
          hint={
            company && Number(company.availableCredit) < 0
              ? "limit aşıldı"
              : undefined
          }
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
          {/* Ortak `Chips`: seçili olan siyah dolar. Bu şerit kendi seçili
              görüntüsünü yazmıştı (marka çerçevesi + açık zemin) ve aynı
              arayüzde ikinci bir "seçili küçük düğme" hâli üretiyordu. */}
          <Chips value={method} onChange={setMethod} items={METHOD_CHIPS} />
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
          <p className="mt-4 text-xs text-ink-faint">
            {COLLECTION_METHOD_LABELS[method]} carinin borcunu kapatır, ancak
            tahsil edilene kadar kasaya girmez — kasa bakiyesi değişmez.
          </p>
        )}

        {confirming && valid ? (
          // Onay kutusu `WarnLine` değil: içinde iki düğme var ve `WarnLine`
          // tek satırlık bir cümle. Renk yine kehribar — "oldu bitti" demiyor,
          // "şu olacak, emin misin" diyor.
          <div className="mt-4 rounded-lg border border-caution/40 bg-caution/10 p-4">
            <p className="text-body-sm text-caution">
              <span className="font-semibold">{companyName}</span> carisine{" "}
              <span className="text-body-lg font-bold tabular-nums">
                {formatTRY(parsed)}
              </span>{" "}
              {COLLECTION_METHOD_LABELS[method].toLocaleLowerCase("tr")}{" "}
              tahsilat işlenecek.
            </p>
            {afterBalance !== null && (
              <p className="mt-1 text-xs tabular-nums text-caution">
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
                    idempotencyKey,
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
          <ul className="divide-y divide-line">
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
          <p className="flex items-center gap-2 text-body-sm font-semibold text-ink">
            <span
              className={cn(
                "tabular-nums",
                reversed && "line-through opacity-60",
              )}
            >
              {formatTRY(payment.amount)}
            </span>
            {payment.collectionMethod && (
              <Badge tone={reversed ? "neutral" : "success"}>
                {COLLECTION_METHOD_LABELS[payment.collectionMethod]}
              </Badge>
            )}
            {reversed && <Badge tone="danger">İptal edildi</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
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
        <div className="mt-2 rounded border border-line bg-sunken p-3">
          <Label htmlFor={`iptal-${payment.id}`}>İptal gerekçesi</Label>
          <TextInput
            id={`iptal-${payment.id}`}
            autoFocus
            placeholder="Örn. tutar yanlış girildi"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-ink-faint">
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
