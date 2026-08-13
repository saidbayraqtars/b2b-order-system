"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import type { OrderStatus, PaymentMethod } from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Button, Checkbox, ErrorLine, LinkButton } from "@/components/form";
import {
  Badge,
  EmptyState,
  LoadingState,
  TBody,
  THead,
  Table,
  Td,
  Th,
  type BadgeTone,
} from "@/components/ui";

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
  if (ordersQuery.isError) return <ErrorLine error={ordersQuery.error} />;

  const orders = ordersQuery.data?.orders ?? [];
  if (orders.length === 0) {
    return <EmptyState label="Sipariş yok." />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card dark:border-neutral-800 dark:bg-neutral-900">
      <ErrorLine error={action.error} />
      {canPrint && (
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">
            {selected.length > 0
              ? `${selected.length} sipariş seçili`
              : "Toplu basım için satırları işaretleyin"}
          </span>
          {/* Hiçbir şey seçilmemişken tıklanamaz: `disabled` bir bağlantıda
              yok, o yüzden hem işaretleniyor hem olayı yutuluyor. */}
          <LinkButton
            href={`/documents/labels?kind=ORDER_RECEIPT&orders=${selected.join(",")}`}
            target="_blank"
            rel="noreferrer"
            aria-disabled={selected.length === 0}
            className={
              selected.length === 0
                ? "pointer-events-none opacity-40"
                : undefined
            }
          >
            <Printer className="h-3.5 w-3.5" />
            Sipariş fişi (80 mm)
          </LinkButton>
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
      <Table>
        <THead>
          <tr>
            {canPrint && (
              <Th className="w-8">
                <Checkbox
                  aria-label="Tümünü seç"
                  checked={
                    selected.length > 0 && selected.length === orders.length
                  }
                  onChange={(e) =>
                    setSelected(e.target.checked ? orders.map((o) => o.id) : [])
                  }
                />
              </Th>
            )}
            <Th>Sipariş</Th>
            <Th>Firma</Th>
            <Th>Oluşturan</Th>
            <Th align="right">Tutar</Th>
            <Th>Durum</Th>
            <Th align="right">İşlem</Th>
          </tr>
        </THead>
        <TBody>
          {orders.map((o) => {
            const pending =
              canAct &&
              (o.status === "PENDING_APPROVAL" ||
                o.status === "PENDING_CREDIT");
            const canApprove =
              o.status === "PENDING_APPROVAL" ||
              (o.status === "PENDING_CREDIT" && canApproveCredit);
            return (
              <tr key={o.id}>
                {canPrint && (
                  <Td>
                    <Checkbox
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
                  </Td>
                )}
                <Td className="font-medium">
                  <Link href={`/orders/${o.id}`} className="hover:underline">
                    {o.orderNumber}
                  </Link>
                  <span className="ml-1 text-xs text-neutral-400">
                    ({o._count.items} kalem)
                  </span>
                </Td>
                <Td>{o.company.name}</Td>
                <Td muted>{o.createdBy.name}</Td>
                <Td align="right" numeric>
                  {formatTRY(o.grandTotal)}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[o.status]}>
                    {STATUS_LABEL[o.status]}
                  </Badge>
                </Td>
                <Td align="right">
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
                </Td>
              </tr>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
