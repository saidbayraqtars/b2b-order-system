"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import type { OrderStatus, PaymentMethod } from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Button } from "@/components/form";
import { Badge, EmptyState, LoadingState, type BadgeTone } from "@/components/ui";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  grandTotal: string;
  createdAt: string;
  company: { id: string; name: string };
  createdBy: { id: string; name: string };
  _count: { items: number };
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay bekliyor",
  PENDING_CREDIT: "Kredi onayı bekliyor",
  CONFIRMED: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal",
  REJECTED: "Reddedildi",
};

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  PENDING_CREDIT: "warning",
  CONFIRMED: "success",
  PROCESSING: "info",
  SHIPPED: "brand",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REJECTED: "danger",
};

export function OrdersBoard({
  canApproveCredit,
  canAct = true,
  companyId,
  canPrint = false,
}: {
  /** SUPER_ADMIN may confirm PENDING_CREDIT orders; company admins may not. */
  canApproveCredit: boolean;
  /** False for read-only surfaces (company staff), which hide the buttons. */
  canAct?: boolean;
  /**
   * Scope the list to one company. Needed when a rep or super admin is working
   * on a customer's behalf — without it they would get their whole portfolio.
   * The server authorizes it either way.
   */
  companyId?: string;
  /** Fiş/etiket basımı sütunu çıksın mı (`documents.view`). */
  canPrint?: boolean;
}) {
  const qc = useQueryClient();
  // Toplu basım seçimi. Ekranda tutuluyor, sunucuya yalnızca basım anında
  // kimlik listesi olarak gidiyor — "seçili siparişler" diye kalıcı bir kavram
  // yaratmanın karşılığı yok.
  const [selected, setSelected] = useState<string[]>([]);
  const ordersQuery = useQuery({
    queryKey: ["orders", companyId ?? null],
    queryFn: () =>
      apiGet<{ orders: OrderListItem[] }>(
        companyId
          ? `/api/orders?companyId=${encodeURIComponent(companyId)}`
          : "/api/orders",
      ),
  });

  const action = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "approve" | "reject" }) =>
      apiPost(`/api/orders/${id}/${kind}`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  if (ordersQuery.isLoading) {
    return <LoadingState />;
  }
  if (ordersQuery.isError) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {(ordersQuery.error as Error).message}
      </p>
    );
  }

  const orders = ordersQuery.data?.orders ?? [];
  if (orders.length === 0) {
    return <EmptyState label="Sipariş yok." />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card dark:border-neutral-800 dark:bg-neutral-900">
      {action.isError && (
        <p className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {(action.error as Error).message}
        </p>
      )}
      {canPrint && (
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">
            {selected.length > 0
              ? `${selected.length} sipariş seçili`
              : "Toplu basım için satırları işaretleyin"}
          </span>
          <a
            href={`/documents/labels?kind=ORDER_RECEIPT&orders=${selected.join(",")}`}
            target="_blank"
            rel="noreferrer"
            aria-disabled={selected.length === 0}
            className={
              selected.length === 0
                ? "pointer-events-none inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs opacity-40 dark:border-neutral-700"
                : "inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
            }
          >
            <Printer className="h-3.5 w-3.5" />
            Sipariş fişi (80 mm)
          </a>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs text-neutral-500 hover:underline"
            >
              Seçimi temizle
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
          <tr>
            {canPrint && (
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Tümünü seç"
                  checked={selected.length > 0 && selected.length === orders.length}
                  onChange={(e) =>
                    setSelected(e.target.checked ? orders.map((o) => o.id) : [])
                  }
                />
              </th>
            )}
            <th className="px-3 py-2">Sipariş</th>
            <th className="px-3 py-2">Firma</th>
            <th className="px-3 py-2">Oluşturan</th>
            <th className="px-3 py-2 text-right">Tutar</th>
            <th className="px-3 py-2">Durum</th>
            <th className="px-3 py-2 text-right">İşlem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {orders.map((o) => {
            const pending =
              canAct &&
              (o.status === "PENDING_APPROVAL" || o.status === "PENDING_CREDIT");
            const canApprove =
              o.status === "PENDING_APPROVAL" ||
              (o.status === "PENDING_CREDIT" && canApproveCredit);
            return (
              <tr key={o.id}>
                {canPrint && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${o.orderNumber} seç`}
                      checked={selected.includes(o.id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, o.id]
                            : prev.filter((id) => id !== o.id),
                        )
                      }
                    />
                  </td>
                )}
                <td className="px-3 py-2 font-medium">
                  <Link href={`/orders/${o.id}`} className="hover:underline">
                    {o.orderNumber}
                  </Link>
                  <span className="ml-1 text-xs text-neutral-400">
                    ({o._count.items} kalem)
                  </span>
                </td>
                <td className="px-3 py-2">{o.company.name}</td>
                <td className="px-3 py-2 text-neutral-500">
                  {o.createdBy.name}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatTRY(o.grandTotal)}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  {canPrint && (
                    <a
                      href={`/documents/labels?kind=ORDER_RECEIPT&orders=${o.id}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Sipariş fişi"
                      className="mr-2 inline-flex text-neutral-500 hover:text-brand-600"
                    >
                      <Printer className="h-4 w-4" />
                    </a>
                  )}
                  {pending && (
                    <div className="flex justify-end gap-2">
                      {canApprove && (
                        <Button
                          variant="success"
                          size="sm"
                          loading={action.isPending}
                          onClick={() =>
                            action.mutate({ id: o.id, kind: "approve" })
                          }
                        >
                          Onayla
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        loading={action.isPending}
                        onClick={() =>
                          action.mutate({ id: o.id, kind: "reject" })
                        }
                      >
                        Reddet
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
