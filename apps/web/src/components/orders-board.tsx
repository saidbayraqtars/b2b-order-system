"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderStatus, PaymentMethod } from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";

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

const STATUS_CLASS: Record<OrderStatus, string> = {
  DRAFT: "bg-neutral-100 text-neutral-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  PENDING_CREDIT: "bg-orange-100 text-orange-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  SHIPPED: "bg-indigo-100 text-indigo-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-neutral-200 text-neutral-600",
  REJECTED: "bg-red-100 text-red-800",
};

export function OrdersBoard({
  canApproveCredit,
}: {
  /** SUPER_ADMIN may confirm PENDING_CREDIT orders; company admins may not. */
  canApproveCredit: boolean;
}) {
  const qc = useQueryClient();
  const ordersQuery = useQuery({
    queryKey: ["orders"],
    queryFn: () => apiGet<{ orders: OrderListItem[] }>("/api/orders"),
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
    return <p className="text-sm text-neutral-500">Yükleniyor…</p>;
  }
  if (ordersQuery.isError) {
    return (
      <p className="text-sm text-red-600">
        {(ordersQuery.error as Error).message}
      </p>
    );
  }

  const orders = ordersQuery.data?.orders ?? [];
  if (orders.length === 0) {
    return <p className="text-sm text-neutral-500">Sipariş yok.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      {action.isError && (
        <p className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(action.error as Error).message}
        </p>
      )}
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
          <tr>
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
              o.status === "PENDING_APPROVAL" || o.status === "PENDING_CREDIT";
            const canApprove =
              o.status === "PENDING_APPROVAL" ||
              (o.status === "PENDING_CREDIT" && canApproveCredit);
            return (
              <tr key={o.id}>
                <td className="px-3 py-2 font-medium">
                  {o.orderNumber}
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
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[o.status]}`}
                  >
                    {STATUS_LABEL[o.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {pending && (
                    <div className="flex justify-end gap-2">
                      {canApprove && (
                        <button
                          type="button"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate({ id: o.id, kind: "approve" })
                          }
                          className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Onayla
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({ id: o.id, kind: "reject" })
                        }
                        className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        Reddet
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
