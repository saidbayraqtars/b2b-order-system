"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RETURN_STATUS_LABELS,
  type ReturnStatus,
  type ReturnableLineView,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Badge, EmptyState, LoadingState } from "@/components/ui";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";

// Siparişten iade talebi açma.
//
// Yalnızca sevk edilmiş siparişte görünüyor: çıkmamış mal geri gelmez, o iş
// iptal ve zaten "Durum güncelle" panelinde. İki işi aynı yere koymak,
// kullanıcıya defterde farklı iki sonucu aynı düğme gibi gösterirdi.
//
// Panel karar vermiyor, yalnızca istiyor. Kabul/ret satıcının ekranında —
// alıcının kendi iadesini onaylayabilmesi, kendine alacak yazdırabilmesi
// demekti.

interface ReturnRow {
  id: string;
  rmaNumber: string;
  status: ReturnStatus;
  refundTotal: string;
  reason: string;
  createdAt: string;
}

const STATUS_TONE: Record<
  ReturnStatus,
  "neutral" | "success" | "warning" | "danger"
> = {
  REQUESTED: "warning",
  APPROVED: "neutral",
  RECEIVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export function ReturnPanel({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const existing = useQuery({
    queryKey: ["returns", "order", orderId],
    queryFn: () =>
      apiGet<{ returns: ReturnRow[] }>(`/api/returns?orderId=${orderId}`),
  });

  const returnable = useQuery({
    queryKey: ["returnable", orderId],
    enabled: open,
    queryFn: () =>
      apiGet<{ lines: ReturnableLineView[] }>(
        `/api/orders/${orderId}/returnable`,
      ),
  });

  const create = useMutation({
    mutationFn: (input: {
      reason: string;
      items: Array<{ orderItemId: string; quantity: number }>;
    }) => apiPost("/api/returns", { orderId, ...input }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      setQuantities({});
      void qc.invalidateQueries({ queryKey: ["returns"] });
      void qc.invalidateQueries({ queryKey: ["returnable", orderId] });
    },
  });

  const lines = returnable.data?.lines ?? [];
  const chosen = lines
    .map((line) => ({
      orderItemId: line.orderItemId,
      quantity: quantities[line.orderItemId] ?? 0,
    }))
    .filter((item) => item.quantity > 0);

  return (
    <Panel title="İade">
      {existing.isLoading ? (
        <LoadingState />
      ) : (existing.data?.returns.length ?? 0) > 0 ? (
        <ul className="space-y-2 text-body-sm">
          {existing.data!.returns.map((row) => (
            <li key={row.id} className="flex items-center gap-2">
              <span className="font-medium tabular-nums">{row.rmaNumber}</span>
              <Badge tone={STATUS_TONE[row.status]}>
                {RETURN_STATUS_LABELS[row.status]}
              </Badge>
              {row.status === "RECEIVED" ? (
                <span className="tabular-nums text-ink-muted">
                  {formatTRY(row.refundTotal)}
                </span>
              ) : null}
              <span className="truncate text-ink-muted" title={row.reason}>
                {row.reason}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState label="Bu siparişten iade talebi açılmadı." />
      )}

      <ErrorLine error={create.error} />

      {!open ? (
        <div className="pt-3">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            İade talebi aç
          </Button>
        </div>
      ) : returnable.isLoading ? (
        <LoadingState />
      ) : returnable.isError ? (
        <ErrorLine error={returnable.error} />
      ) : (
        <form
          className="space-y-3 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ reason: reason.trim(), items: chosen });
          }}
        >
          <div className="space-y-2">
            {lines.map((line) => (
              <div
                key={line.orderItemId}
                className="grid grid-cols-[1fr_6rem] items-end gap-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-body-sm font-medium text-ink">
                    {line.productName}
                  </div>
                  <div className="text-xs text-ink-faint">
                    {line.sku} · iade edilebilir {line.returnableQuantity}
                  </div>
                </div>
                <div>
                  <Label htmlFor={`ret-${line.orderItemId}`}>Adet</Label>
                  <TextInput
                    id={`ret-${line.orderItemId}`}
                    type="number"
                    min={0}
                    max={line.returnableQuantity}
                    disabled={line.returnableQuantity === 0}
                    value={String(quantities[line.orderItemId] ?? 0)}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [line.orderItemId]: Math.min(
                          line.returnableQuantity,
                          Math.max(0, Number(e.target.value) || 0),
                        ),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <Label htmlFor="return-reason">Gerekçe</Label>
            <TextInput
              id="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Neden geri gönderiyorsunuz?"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              loading={create.isPending}
              // Gerekçesiz ya da satırsız talep, karar verecek kişiye hiçbir
              // şey söylemez; uç da zaten reddediyor.
              disabled={chosen.length === 0 || reason.trim().length < 3}
            >
              Talep aç
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
