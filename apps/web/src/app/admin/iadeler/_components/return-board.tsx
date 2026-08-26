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
import { formatTRY } from "@/lib/format";
import {
  Badge,
  Card,
  EmptyState,
  LoadingState,
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

function trDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("tr-TR") : "—";
}

export function ReturnBoard() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"OPEN" | ReturnStatus>(
    "OPEN",
  );
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
          <Stat
            label="Karar bekleyen"
            value={String(openCount)}
            note="talep"
            tone={openCount > 0 ? "warning" : "neutral"}
          />
          <Stat
            label="Mal bekleyen"
            value={String(waitingGoods)}
            note="kabul edildi, gelmedi"
          />
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={statusFilter === "OPEN"}
            onClick={() => setStatusFilter("OPEN")}
            label="Açık"
          />
          {ReturnStatusEnum.options.map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              label={RETURN_STATUS_LABELS[s]}
            />
          ))}
        </div>
      </Card>

      <ErrorLine error={error ? new Error(error) : null} />

      {isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState label="Bu süzgeçle iade talebi yok." />
      ) : (
        <Panel title="Talepler">
          <Table>
            <THead>
              <tr>
                <Th>İade no</Th>
                <Th>Firma</Th>
                <Th>Sipariş</Th>
                <Th>Gerekçe</Th>
                <Th>Satır</Th>
                <Th>Tutar</Th>
                <Th>Durum</Th>
                <Th>Tarih</Th>
                <Th> </Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <span className="font-medium tabular-nums">
                      {row.rmaNumber}
                    </span>
                  </Td>
                  <Td>{row.companyName}</Td>
                  <Td className="tabular-nums">{row.orderNumber}</Td>
                  <Td>
                    <span
                      className="line-clamp-2 max-w-[22ch] text-neutral-600 dark:text-neutral-400"
                      title={row.reason}
                    >
                      {row.reason}
                    </span>
                  </Td>
                  <Td className="tabular-nums">{row.itemCount}</Td>
                  <Td className="tabular-nums">
                    {/* Tutar teslim alınana kadar tahmin: gelen mal neyse o
                        yazılıyor, o yüzden RECEIVED öncesi bilerek soluk. */}
                    <span
                      className={
                        row.status === "RECEIVED" ? "" : "text-neutral-500"
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
                  <Td className="whitespace-nowrap tabular-nums">
                    {trDate(row.receivedAt ?? row.decidedAt ?? row.createdAt)}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1">
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

function Stat({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-red-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-neutral-900 dark:text-neutral-100";
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
      <div className="text-xs text-neutral-500">{note}</div>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "primary" : "secondary"}
      className="rounded-full"
      onClick={onClick}
    >
      {label}
    </Button>
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
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {row.companyName} · sipariş {row.orderNumber}
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Gerekçe: {row.reason}
        </p>

        {receiving ? (
          isLoading ? (
            <LoadingState />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">
                Gelen mal neyse o yazılır. Adet 0 girilen satır düşer; hasarlı
                işaretlenen stoka girmez ama bedeli yine alacak yazılır.
              </p>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_5rem_9rem] items-end gap-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {item.productName}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {item.sku} · talep {item.quantity}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`qty-${item.id}`}>Gelen</Label>
                    <TextInput
                      id={`qty-${item.id}`}
                      type="number"
                      min={0}
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
