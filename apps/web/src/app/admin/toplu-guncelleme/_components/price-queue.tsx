"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScheduledPriceRow } from "@repo/services";
import { PRICE_CHANGE_STATUS_LABELS, type PriceChangeStatus } from "@repo/types";
import { apiDelete, apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Button, ErrorLine, Panel } from "@/components/form";
import {
  Badge,
  type BadgeTone,
  Chips,
  LoadingState,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useUrlState } from "@/lib/url-state";

// Zamanlı fiyat değişimi kuyruğu.
//
// Ekran **kayıt açmıyor**: satırlar Excel'deki "Geçerlilik tarihi" sütunundan
// geliyor. Bir zam listesi yüzlerce satır ve onu tek tek forma girmek, listeyi
// zaten Excel'de kuran kişiye yapılabilecek en kötü teklif. Buradan yapılabilen
// tek şey **iptal** — ve yalnızca bekleyen bir satır için.

const STATUS_TONE: Record<PriceChangeStatus, BadgeTone> = {
  PENDING: "warning",
  APPLIED: "success",
  CANCELLED: "neutral",
  FAILED: "danger",
};

const STATUS_FILTERS = (
  ["PENDING", "APPLIED", "FAILED", "CANCELLED"] as const
).map((key) => ({ key, label: PRICE_CHANGE_STATUS_LABELS[key] }));

/** Süzgeç varsayılanı — modül düzeyinde, `useUrlState` kimlik bekliyor. */
const FILTER_DEFAULTS = { durum: "PENDING" };

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function PriceQueue() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const filters = useUrlState(FILTER_DEFAULTS);
  const status = filters.value.durum as PriceChangeStatus;

  const query = useQuery({
    queryKey: ["price-schedule", status],
    queryFn: () =>
      apiGet<{ changes: ScheduledPriceRow[] }>(
        `/api/admin/price-schedule?status=${status}`,
      ),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/price-schedule/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["price-schedule"] });
      notify("Değişiklik iptal edildi");
    },
  });

  const rows = query.data?.changes ?? [];

  return (
    <Panel
      title="Zamanlı fiyat değişiklikleri"
      bodyClassName="p-0"
      action={
        <Chips
          value={status}
          onChange={(durum) => filters.set({ durum })}
          items={STATUS_FILTERS}
        />
      }
    >
      {query.isLoading && (
        <div className="px-4">
          <LoadingState />
        </div>
      )}
      <div className="px-4">
        <ErrorLine error={query.error ?? cancel.error} />
      </div>

      <Table stickyHead>
        <THead>
          <tr>
            <Th>Yürürlük</Th>
            <Th>SKU</Th>
            <Th>Ürün</Th>
            <Th>Grup</Th>
            <Th align="right">Min adet</Th>
            <Th align="right">Bugünkü</Th>
            <Th align="right">Olacak</Th>
            <Th>Durum</Th>
            <Th />
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && query.isSuccess && (
            <TableEmpty
              colSpan={9}
              label={
                status === "PENDING"
                  ? "Bekleyen fiyat değişikliği yok — Excel'deki “Geçerlilik tarihi” sütununu doldurup fiyat sekmesinden yükleyin."
                  : "Bu durumda kayıt yok."
              }
            />
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap font-medium text-ink">
                {day(r.effectiveAt)}
              </Td>
              <Td className="font-mono text-xs">{r.sku}</Td>
              <Td muted>{r.productName}</Td>
              <Td muted>{r.groupName ?? "liste"}</Td>
              <Td align="right" numeric muted>
                {r.minQuantity}
              </Td>
              {/* Uygulanmış satırda "bugünkü" fiyat artık yeni fiyat; anlamlı
                  olan **eskisi**, yani ne kadar zam yapıldığı. */}
              <Td align="right" numeric muted>
                {r.status === "APPLIED"
                  ? r.previousPrice === null
                    ? "—"
                    : formatTRY(Number(r.previousPrice))
                  : r.currentPrice === null
                    ? "—"
                    : formatTRY(Number(r.currentPrice))}
              </Td>
              <Td align="right" numeric className="font-medium text-ink">
                {formatTRY(Number(r.price))}
              </Td>
              <Td>
                <span className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[r.status]}>
                    {PRICE_CHANGE_STATUS_LABELS[r.status]}
                  </Badge>
                  {r.failureReason && (
                    <span className="text-xs text-critical">
                      {r.failureReason}
                    </span>
                  )}
                </span>
              </Td>
              <Td align="right">
                {r.status === "PENDING" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cancel.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `${r.sku} için ${day(r.effectiveAt)} tarihli değişiklik iptal edilsin mi?`,
                        )
                      ) {
                        cancel.mutate(r.id);
                      }
                    }}
                  >
                    İptal
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}
