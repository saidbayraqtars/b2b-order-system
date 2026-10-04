"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RETURN_CONDITION_LABELS,
  RETURN_STATUS_LABELS,
  RETURN_TRANSITIONS,
  ReturnStatusEnum,
  type ReturnCondition,
  type ReturnStatus,
  type ReturnView,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { useUrlState } from "@/lib/url-state";
import { formatTRY, formatQuantity } from "@/lib/format";
import {
  Badge,
  Card,
  Chips,
  EmptyState,
  LoadingState,
  StatTile,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import {
  Button,
  ErrorLine,
  Label,
  Modal,
  Panel,
  Select,
  TextInput,
} from "@/components/form";

// İade ekranı.
//
// Ekranın tek sorusu **"kim ne bekliyor"**: karar bekleyen talepler ile kabul
// edilmiş ama mal gelmemiş olanlar üstte duruyor, kapananlar süzgeçle
// çağrılıyor. Bu yüzden varsayılan görünüm "açık" — teslim alınmış yüzlerce
// iade, karar bekleyen bir tanesini gözden kaçırtmamalı.
//
// Teslim alma penceresi satır satır düzeltmeye izin veriyor çünkü sahada olan
// bu: üç koli istenir, ikisi gelir; "sağlam" denir, kırık çıkar. Yazılan şey
// gelen mal.

type Row = Omit<ReturnView, "items"> & { itemCount: number };

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

/** Düğmenin üstünde yazan fiil — "APPROVED" değil, "Kabul et". */
const ACTION_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "Talebe geri al",
  APPROVED: "Kabul et",
  RECEIVED: "Teslim al",
  REJECTED: "Reddet",
  CANCELLED: "İptal et",
};

/** "Açık" gerçek bir durum değil, karar ya da mal bekleyenlerin toplamı. */
const STATUS_FILTERS: ReadonlyArray<{
  key: "OPEN" | ReturnStatus;
  label: string;
}> = [
  { key: "OPEN", label: "Açık" },
  ...ReturnStatusEnum.options.map((s) => ({
    key: s,
    label: RETURN_STATUS_LABELS[s],
  })),
];

function trDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("tr-TR") : "—";
}

/** Süzgeç varsayılanı — modül düzeyinde, `useUrlState` kimlik bekliyor. */
const FILTER_DEFAULTS = { durum: "OPEN" };

export function ReturnBoard() {
  const qc = useQueryClient();
  const filters = useUrlState(FILTER_DEFAULTS);
  const statusFilter = filters.value.durum as "OPEN" | ReturnStatus;
  const [acting, setActing] = useState<{ row: Row; to: ReturnStatus } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const qs = statusFilter === "OPEN" ? "open=1" : `status=${statusFilter}`;

  const { data, isLoading } = useQuery({
    queryKey: ["returns", qs],
    queryFn: () => apiGet<{ returns: Row[] }>(`/api/returns?${qs}`),
  });

  const advance = useMutation({
    mutationFn: (input: {
      id: string;
      status: ReturnStatus;
      note?: string;
      items?: Array<{
        returnItemId: string;
        quantity: number;
        condition?: ReturnCondition;
      }>;
    }) => apiPost(`/api/returns/${input.id}`, input),
    onSuccess: () => {
      setActing(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["returns"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows = data?.returns ?? [];
  const openCount = rows.filter((r) => r.status === "REQUESTED").length;
  const waitingGoods = rows.filter((r) => r.status === "APPROVED").length;

  return (
    <div className="space-y-4">
      {statusFilter === "OPEN" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            label="Karar bekleyen"
            value={openCount}
            hint="talep"
            tone={openCount > 0 ? "caution" : "neutral"}
          />
          <StatTile
            label="Mal bekleyen"
            value={waitingGoods}
            hint="kabul edildi, gelmedi"
          />
        </div>
      ) : null}

      <Card>
        <Chips
          value={statusFilter}
          onChange={(durum) => filters.set({ durum })}
          items={STATUS_FILTERS}
        />
      </Card>

      <ErrorLine error={error ? new Error(error) : null} />

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          label={
            filters.isFiltered
              ? "Bu süzgeçle iade talebi yok."
              : "Açık iade talebi yok — talepler sipariş ekranından açılıyor."
          }
          action={
            filters.isFiltered ? (
              <Button size="sm" variant="secondary" onClick={filters.clear}>
                Süzgeci temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Panel title="Talepler" bodyClassName="p-0">
          <Table>
            <THead>
              <tr>
                {/* Dokuz sütun 1440 pikselde sığmıyordu ve taşan sütun
                    "İşlem" oluyordu — yani ekranın tek eylemi kaydırmadan
                    görünmüyordu. Belge numarası siparişini, firma gerekçesini
                    alt satırında taşıyor. */}
                <Th>İade</Th>
                <Th>Firma / gerekçe</Th>
                <Th align="right">Satır</Th>
                <Th align="right">Tutar</Th>
                <Th>Durum</Th>
                <Th>Tarih</Th>
                <Th> </Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td className="whitespace-nowrap">
                    <span className="font-medium tabular-nums">
                      {row.rmaNumber}
                    </span>
                    <span className="block text-xs tabular-nums text-ink-faint">
                      {row.orderNumber}
                    </span>
                  </Td>
                  <Td>
                    <span className="block">{row.companyName}</span>
                    <span
                      className="line-clamp-1 max-w-[28ch] text-xs text-ink-faint"
                      title={row.reason}
                    >
                      {row.reason}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {row.itemCount}
                  </Td>
                  <Td align="right" numeric>
                    {/* Tutar teslim alınana kadar tahmin: gelen mal neyse o
                        yazılıyor, o yüzden RECEIVED öncesi bilerek soluk. */}
                    <span
                      className={
                        row.status === "RECEIVED" ? "" : "text-ink-faint"
                      }
                    >
                      {formatTRY(row.refundTotal)}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[row.status]}>
                      {RETURN_STATUS_LABELS[row.status]}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-ink-faint">
                    {trDate(row.receivedAt ?? row.decidedAt ?? row.createdAt)}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      {RETURN_TRANSITIONS[row.status].map((to) => (
                        <Button
                          key={to}
                          size="sm"
                          variant={to === "RECEIVED" ? "primary" : "secondary"}
                          onClick={() => {
                            setError(null);
                            setActing({ row, to });
                          }}
                        >
                          {ACTION_LABELS[to]}
                        </Button>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}

      {acting ? (
        <ActionModal
          row={acting.row}
          to={acting.to}
          busy={advance.isPending}
          onCancel={() => setActing(null)}
          onSubmit={(payload) =>
            advance.mutate({ id: acting.row.id, status: acting.to, ...payload })
          }
        />
      ) : null}
    </div>
  );
}

interface ActionPayload {
  note?: string;
  items?: Array<{
    returnItemId: string;
    quantity: number;
    condition?: ReturnCondition;
  }>;
}

/**
 * Karar penceresi.
 *
 * Teslim alma dışındaki geçişler tek bir nottan ibaret. Teslim almada satırlar
 * getiriliyor ve tek tek düzeltilebiliyor — bu yüzden pencere talebi ayrıca
 * okuyor: liste satırları taşımıyor (yüzlerce talebin satırını her listede
 * çekmek, hiç açılmayacak satırlar için ödenen bir maliyet).
 */
function ActionModal({
  row,
  to,
  busy,
  onCancel,
  onSubmit,
}: {
  row: Row;
  to: ReturnStatus;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: ActionPayload) => void;
}) {
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<
    Record<string, { quantity: number; condition: ReturnCondition }>
  >({});

  const receiving = to === "RECEIVED";

  const { data, isLoading } = useQuery({
    queryKey: ["return", row.id],
    enabled: receiving,
    queryFn: async () => {
      const res = await apiGet<{ return: ReturnView }>(
        `/api/returns/${row.id}`,
      );
      setLines(
        Object.fromEntries(
          res.return.items.map((i) => [
            i.id,
            { quantity: i.quantity, condition: i.condition },
          ]),
        ),
      );
      return res;
    },
  });

  const items = data?.return.items ?? [];

  return (
    <Modal title={`${ACTION_LABELS[to]} · ${row.rmaNumber}`} onClose={onCancel}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            ...(note.trim() ? { note: note.trim() } : {}),
            ...(receiving
              ? {
                  items: items.map((i) => ({
                    returnItemId: i.id,
                    quantity: lines[i.id]?.quantity ?? i.quantity,
                    condition: lines[i.id]?.condition ?? i.condition,
                  })),
                }
              : {}),
          });
        }}
      >
        <p className="text-body-sm text-ink-muted">
          {row.companyName} · sipariş {row.orderNumber}
        </p>
        <p className="text-body-sm text-ink-muted">Gerekçe: {row.reason}</p>

        {receiving ? (
          isLoading ? (
            <LoadingState />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-ink-faint">
                Gelen mal neyse o yazılır. Adet 0 girilen satır düşer; hasarlı
                işaretlenen stoka girmez ama bedeli yine alacak yazılır.
              </p>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_5rem_9rem] items-end gap-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-body-sm font-medium">
                      {item.productName}
                    </div>
                    <div className="text-xs text-ink-faint">
                      {item.sku} · talep {formatQuantity(item.quantity)}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`qty-${item.id}`}>Gelen</Label>
                    <TextInput
                      id={`qty-${item.id}`}
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      max={item.quantity}
                      value={String(lines[item.id]?.quantity ?? item.quantity)}
                      onChange={(e) =>
                        setLines((prev) => ({
                          ...prev,
                          [item.id]: {
                            quantity: Math.max(0, Number(e.target.value) || 0),
                            condition:
                              prev[item.id]?.condition ?? item.condition,
                          },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`cond-${item.id}`}>Hâli</Label>
                    <Select
                      id={`cond-${item.id}`}
                      value={lines[item.id]?.condition ?? item.condition}
                      onChange={(e) =>
                        setLines((prev) => ({
                          ...prev,
                          [item.id]: {
                            quantity: prev[item.id]?.quantity ?? item.quantity,
                            condition: e.target.value as ReturnCondition,
                          },
                        }))
                      }
                    >
                      {Object.entries(RETURN_CONDITION_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}

        <div>
          <Label htmlFor="return-note">
            {to === "REJECTED" ? "Ret gerekçesi (zorunlu)" : "Not"}
          </Label>
          <TextInput
            id="return-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              to === "REJECTED" ? "Neden reddedildiğini yazın" : "İsteğe bağlı"
            }
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={to === "REJECTED" && note.trim() === ""}
          >
            {ACTION_LABELS[to]}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
