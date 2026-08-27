"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Inbox, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  DEALER_APPLICATION_STATUS_LABELS,
  type DealerApplicationStatus,
  type DealerApplicationView,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import {
  Badge,
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
  Checkbox,
  ErrorLine,
  Label,
  Modal,
  Panel,
  TextArea,
  TextInput,
} from "@/components/form";

// Bayi başvuruları ekranı.
//
// Ekranın tek sorusu **"kim bekliyor"**: varsayılan görünüm karar bekleyenler,
// karara bağlananlar süzgeçle çağrılıyor. Reddedilmiş yüzlerce başvuru, bugün
// gelen bir tanesini gözden kaçırtmamalı.
//
// Onay penceresinde kredi limiti ve vade soruluyor çünkü karar tam olarak bu:
// "bu firmayı alıyor muyuz" ile "ne kadar borçlanabilir" aynı cümlenin iki
// yarısı. Sonradan firma kartından da değiştirilebilir; buradaki alan, ilk
// değeri kimsenin unutmaması için.

const STATUS_TONE: Record<
  DealerApplicationStatus,
  "warning" | "success" | "danger"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

const FILTERS: ReadonlyArray<{ key: "PENDING" | "ALL" | DealerApplicationStatus; label: string }> = [
  { key: "PENDING", label: "Bekleyenler" },
  { key: "APPROVED", label: "Onaylananlar" },
  { key: "REJECTED", label: "Reddedilenler" },
  { key: "ALL", label: "Tümü" },
];

function trDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("tr-TR") : "—";
}

export function ApplicationBoard() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"PENDING" | "ALL" | DealerApplicationStatus>(
    "PENDING",
  );
  const [deciding, setDeciding] = useState<{
    row: DealerApplicationView;
    to: "APPROVE" | "REJECT";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = filter === "ALL" ? "" : `?status=${filter}`;

  const { data, isLoading } = useQuery({
    queryKey: ["dealer-applications", filter],
    queryFn: () =>
      apiGet<{ applications: DealerApplicationView[] }>(
        `/api/dealer-applications${qs}`,
      ),
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; body: unknown }) =>
      apiPost(`/api/dealer-applications/${input.id}`, input.body),
    onSuccess: () => {
      setDeciding(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["dealer-applications"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows = data?.applications ?? [];
  const pending = rows.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-4">
      {filter === "PENDING" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            label="Karar bekleyen"
            value={String(pending)}
            hint={pending > 0 ? "Başvuran cevap bekliyor" : "Kuyruk boş"}
            tone={pending > 0 ? "caution" : "neutral"}
            icon={<Inbox className="h-4 w-4" />}
          />
          <StatTile
            label="Bu listede"
            value={String(rows.length)}
            hint="Süzgece uyan başvuru"
            icon={<Building2 className="h-4 w-4" />}
          />
        </div>
      )}

      <Panel
        title="Başvurular"
        bodyClassName="p-0"
        action={
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={
                  filter === f.key
                    ? "rounded border border-accent bg-accent px-2.5 py-1 text-xs font-medium text-on-accent"
                    : "rounded border border-line px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-subtle"
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {isLoading ? (
          <div className="px-4">
            <LoadingState />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState label="Bu süzgeçte başvuru yok." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Firma</Th>
                <Th>Yetkili</Th>
                <Th>Şehir</Th>
                <Th>Tarih</Th>
                <Th>Durum</Th>
                <Th align="right">İşlem</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <Td>
                    <span className="block font-medium text-ink">
                      {row.companyName}
                    </span>
                    <span className="block text-xs tabular-nums text-ink-faint">
                      {row.taxNumber
                        ? `VN ${row.taxNumber}${row.taxOffice ? ` · ${row.taxOffice}` : ""}`
                        : "Vergi no verilmemiş"}
                    </span>
                    {row.note && (
                      <span className="mt-1 block max-w-md text-xs text-ink-muted">
                        {row.note}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className="block text-ink">{row.contactName}</span>
                    <span className="block text-xs text-ink-faint">
                      {row.email}
                    </span>
                    <span className="block text-xs tabular-nums text-ink-faint">
                      {row.phone}
                    </span>
                  </Td>
                  <Td muted>
                    {row.city}
                    {row.district ? ` / ${row.district}` : ""}
                  </Td>
                  <Td numeric muted>
                    {trDate(row.createdAt)}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[row.status]}>
                      {DEALER_APPLICATION_STATUS_LABELS[row.status]}
                    </Badge>
                    {row.decisionNote && (
                      <span className="mt-1 block max-w-xs text-xs text-ink-faint">
                        {row.decisionNote}
                      </span>
                    )}
                    {row.decidedBy && (
                      <span className="block text-xs text-ink-faint">
                        {row.decidedBy.name} · {trDate(row.decidedAt)}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    {row.status === "PENDING" ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setError(null);
                            setDeciding({ row, to: "REJECT" });
                          }}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                          Reddet
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setError(null);
                            setDeciding({ row, to: "APPROVE" });
                          }}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          Onayla
                        </Button>
                      </div>
                    ) : row.createdCompanyId ? (
                      <Link
                        href={`/admin/companies/${row.createdCompanyId}`}
                        className="text-xs font-medium text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
                      >
                        Firmayı aç
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {deciding && (
        <DecisionModal
          row={deciding.row}
          to={deciding.to}
          error={error}
          busy={decide.isPending}
          onClose={() => setDeciding(null)}
          onSubmit={(body) => decide.mutate({ id: deciding.row.id, body })}
        />
      )}
    </div>
  );
}

function DecisionModal({
  row,
  to,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  row: DealerApplicationView;
  to: "APPROVE" | "REJECT";
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: unknown) => void;
}) {
  const [creditLimit, setCreditLimit] = useState("0");
  const [paymentTermDays, setPaymentTermDays] = useState("0");
  const [requiresOrderApproval, setRequiresOrderApproval] = useState(false);
  const [note, setNote] = useState("");

  const approving = to === "APPROVE";

  return (
    <Modal
      title={approving ? "Başvuruyu onayla" : "Başvuruyu reddet"}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded border border-line bg-sunken px-3 py-2">
          <p className="text-body-sm font-medium text-ink">{row.companyName}</p>
          <p className="text-xs text-ink-faint">
            {row.contactName} · {row.email}
          </p>
        </div>

        {approving ? (
          <>
            <p className="text-body-sm text-ink-muted">
              Onaylandığında firma kartı ve <strong>{row.contactName}</strong>{" "}
              adına bir yönetici hesabı açılır. Şifre üretilmez; kullanıcıya
              şifre belirleme bağlantısı e-posta ile gider.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="creditLimit" hint="₺">
                  Kredi limiti
                </Label>
                <TextInput
                  id="creditLimit"
                  inputMode="decimal"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="paymentTermDays" hint="gün">
                  Vade
                </Label>
                <TextInput
                  id="paymentTermDays"
                  inputMode="numeric"
                  value={paymentTermDays}
                  onChange={(e) => setPaymentTermDays(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-ink-faint">
              İkisi de 0 bırakılabilir: limitsiz değil, peşin demektir. Firma
              kartından sonradan değiştirilebilir.
            </p>
            <Checkbox
              checked={requiresOrderApproval}
              onChange={(e) => setRequiresOrderApproval(e.target.checked)}
              label="Siparişleri firma yöneticisinin onayından geçsin"
              hint="Küçük bayilerde kapalı bırakın"
            />
            <div>
              <Label htmlFor="note" hint="(isteğe bağlı)">
                İç not
              </Label>
              <TextArea
                id="note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Kararın gerekçesi — başvurana gönderilmez."
              />
            </div>
          </>
        ) : (
          <div>
            <Label htmlFor="note">Ret gerekçesi</Label>
            <TextArea
              id="note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Neden reddedildiği — yalnızca kayıt için, başvurana gönderilmez."
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              Başvurana yalnızca kararın kendisi bildirilir, gerekçe
              gönderilmez.
            </p>
          </div>
        )}

        <ErrorLine error={error} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            variant={approving ? "primary" : "danger"}
            loading={busy}
            onClick={() =>
              onSubmit(
                approving
                  ? {
                      decision: "APPROVE",
                      creditLimit,
                      paymentTermDays,
                      requiresOrderApproval,
                      note,
                    }
                  : { decision: "REJECT", note },
              )
            }
          >
            {approving ? "Onayla ve hesabı aç" : "Reddet"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
