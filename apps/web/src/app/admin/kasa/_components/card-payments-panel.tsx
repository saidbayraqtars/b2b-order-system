"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentIntentRow, PaymentProviderInfo } from "@repo/services";
import {
  PAYMENT_INTENT_STATUS_LABELS,
  PaymentIntentStatusEnum,
  type PaymentIntentStatus,
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
import { Badge, EmptyState, LoadingState, type BadgeTone } from "@/components/ui";

// Kart tahsilatları.
//
// A card order no longer walks its money into the till at confirmation — it
// opens an intent, and the money arrives here only when the charge does. With
// the built-in `manual` provider that means someone swiped the terminal by the
// counter and presses onayla; with a real provider it means the provider said
// so, and the button is not offered at all.

interface IntentsResponse {
  intents: PaymentIntentRow[];
  providers: PaymentProviderInfo[];
  activeProvider: string;
}

const STATUS_TONE: Record<PaymentIntentStatus, BadgeTone> = {
  PENDING: "warning",
  AUTHORIZED: "info",
  CAPTURED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

export function CardPaymentsPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<PaymentIntentStatus | "">("PENDING");

  const query = useQuery({
    queryKey: ["payment-intents", status],
    queryFn: () =>
      apiGet<IntentsResponse>(
        `/api/admin/payment-intents${status ? `?status=${status}` : ""}`,
      ),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["payment-intents"] });
    void qc.invalidateQueries({ queryKey: ["cash-movements"] });
    void qc.invalidateQueries({ queryKey: ["cash-accounts"] });
    void qc.invalidateQueries({ queryKey: ["cash-summary"] });
  };

  const active = query.data?.providers.find((p) => p.active);

  return (
    <Panel
      title="Kart tahsilatları"
      action={
        <label>
          <Label>Durum</Label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as PaymentIntentStatus | "")}
            className="w-44"
          >
            <option value="">Tümü</option>
            {PaymentIntentStatusEnum.options.map((s) => (
              <option key={s} value={s}>
                {PAYMENT_INTENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
      }
    >
      {query.data && (
        <p className="mb-3 text-xs text-neutral-500">
          Sağlayıcı:{" "}
          <strong>{active?.label ?? query.data.activeProvider}</strong>
          {active?.capabilities.manual
            ? " — tahsilat POS cihazında yapılır, buradan onaylanır."
            : " — tahsilatı sağlayıcı bildirir; elle onaylanamaz."}
        </p>
      )}

      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />

      {query.data &&
        (query.data.intents.length === 0 ? (
          <EmptyState label="Bu durumda kart tahsilatı yok." />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {query.data.intents.map((intent) => (
              <IntentRow key={intent.id} intent={intent} onChanged={refresh} />
            ))}
          </ul>
        ))}
    </Panel>
  );
}

function IntentRow({
  intent,
  onChanged,
}: {
  intent: PaymentIntentRow;
  onChanged: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  const capture = useMutation({
    mutationFn: () => apiPost(`/api/admin/payment-intents/${intent.id}/capture`, {}),
    onSuccess: onChanged,
  });
  const cancel = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/payment-intents/${intent.id}/cancel`, { reason }),
    onSuccess: () => {
      setAsking(false);
      setReason("");
      onChanged();
    },
  });

  const open = intent.status === "PENDING" || intent.status === "AUTHORIZED";

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span>{formatTRY(intent.amount)}</span>
            <Badge tone={STATUS_TONE[intent.status]}>
              {PAYMENT_INTENT_STATUS_LABELS[intent.status]}
            </Badge>
            {intent.installmentCount > 1 && (
              <Badge tone="neutral">{intent.installmentCount} taksit</Badge>
            )}
          </p>
          <p className="text-neutral-500">
            {intent.companyName}
            {intent.orderNumber ? ` · ${intent.orderNumber}` : ""} ·{" "}
            {new Date(intent.createdAt).toLocaleString("tr-TR")}
            {intent.providerRef ? ` · ${intent.providerRef}` : ""}
          </p>
          {intent.failureReason && (
            <p className="text-red-600 dark:text-red-400">{intent.failureReason}</p>
          )}
        </div>

        {open && (
          <div className="flex items-center gap-2">
            {/* Only a manual provider gets this button. Declaring a real
                provider's charge received by hand would be inventing money. */}
            {intent.awaitingManualConfirmation && (
              <Button
                size="sm"
                variant="success"
                loading={capture.isPending}
                onClick={() => capture.mutate()}
              >
                Tahsil edildi
              </Button>
            )}
            {asking ? (
              <>
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
                  loading={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  İptal et
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                  Vazgeç
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
                İptal
              </Button>
            )}
          </div>
        )}
      </div>
      <ErrorLine error={capture.error ?? cancel.error} />
    </li>
  );
}
