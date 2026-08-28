"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import type { CollectionWorklist, WorklistRow } from "@repo/services";
import {
  COLLECTION_OUTCOME_LABELS,
  CollectionOutcomeEnum,
  type CollectionOutcome,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import {
  Button,
  ErrorLine,
  Label,
  Modal,
  Panel,
  Select,
  TextArea,
  TextInput,
} from "@/components/form";
import {
  Badge,
  type BadgeTone,
  LoadingState,
  StatTile,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { ShowMore, useVisibleSlice } from "@/components/show-more";

// Tahsilat çalışma listesi — "bugün kimi arayacağım".
//
// Yaşlandırma "kim ne kadar borçlu" diyor; bu liste **sırada kim var** diyor.
// Aradaki fark aramanın sonucu: söz veren müşteri, sözünün günü gelene kadar
// listenin altında bekliyor ve o gün geldiğinde en üste çıkıyor.

type State = WorklistRow["state"];

const STATE_LABEL: Record<State, string> = {
  PROMISE_DUE: "Sözü geçti",
  UNREACHABLE: "Ulaşılamadı",
  NEVER_CALLED: "Hiç aranmadı",
  NO_PROMISE: "Söz yok",
  REFUSED: "Reddetti",
  PROMISE_PENDING: "Söz bekleniyor",
};

const STATE_TONE: Record<State, BadgeTone> = {
  PROMISE_DUE: "danger",
  UNREACHABLE: "warning",
  NEVER_CALLED: "info",
  NO_PROMISE: "warning",
  REFUSED: "danger",
  PROMISE_PENDING: "neutral",
};

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** Bugünün `YYYY-MM-DD` hâli — söz tarihinin varsayılanı. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function CollectionWorklistPanel({
  /** Tahsilat girişine götüren yol; plasiyerde `/rep/tahsilat`. */
  collectHref,
}: {
  collectHref: string;
}) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [calling, setCalling] = useState<WorklistRow | null>(null);

  const query = useQuery({
    queryKey: ["collection-worklist"],
    queryFn: () =>
      apiGet<{ worklist: CollectionWorklist }>("/api/collection-calls"),
  });

  const worklist = query.data?.worklist;
  const page = useVisibleSlice(worklist?.rows ?? [], 25);

  if (query.isLoading) {
    return (
      <Panel title="Bugün kimi arayacağım">
        <LoadingState />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {worklist && (
        <section className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Aranacak"
            value={worklist.actionable}
            hint="sözü beklenenler hariç"
            tone={worklist.actionable > 0 ? "caution" : "positive"}
          />
          <StatTile
            label="Vadesi geçmiş"
            value={formatTRY(Number(worklist.overdueTotal))}
            hint="listedeki toplam"
          />
          {/* Tutulmamış sözlerin tutarı: aramanın aciliyetini bu belirliyor,
              borç büyüklüğü değil. */}
          <StatTile
            label="Tutulmayan söz"
            value={formatTRY(Number(worklist.brokenPromiseTotal))}
            hint="günü geldi, para gelmedi"
            tone={
              Number(worklist.brokenPromiseTotal) > 0 ? "critical" : "neutral"
            }
          />
        </section>
      )}

      <Panel title="Bugün kimi arayacağım" bodyClassName="p-0">
        <div className="px-4">
          <ErrorLine error={query.error} />
        </div>
        <Table stickyHead>
          <THead>
            <tr>
              <Th>Firma</Th>
              <Th align="right">Vadesi geçmiş</Th>
              <Th align="right">Gecikme</Th>
              <Th>Durum</Th>
              <Th>Son arama</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {page.visible.length === 0 && (
              <TableEmpty
                colSpan={6}
                label="Vadesi geçmiş borcu olan cari yok — aranacak kimse yok."
              />
            )}
            {page.visible.map((r) => (
              <tr key={r.companyId}>
                <Td>
                  <Link
                    href={`${collectHref}?companyId=${r.companyId}`}
                    className="font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {r.companyName}
                  </Link>
                  {r.phone && (
                    <a
                      href={`tel:${r.phone}`}
                      className="ml-2 inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink"
                    >
                      <Phone className="h-3 w-3" />
                      {r.phone}
                    </a>
                  )}
                </Td>
                <Td align="right" numeric className="font-medium text-ink">
                  {formatTRY(Number(r.overdue))}
                </Td>
                <Td
                  align="right"
                  numeric
                  className={r.daysOverdue > 30 ? "text-critical" : "text-ink-faint"}
                >
                  {r.daysOverdue} gün
                </Td>
                <Td>
                  <Badge tone={STATE_TONE[r.state]}>
                    {STATE_LABEL[r.state]}
                  </Badge>
                </Td>
                <Td muted>
                  {r.lastCall ? (
                    <span className="text-xs">
                      {day(r.lastCall.at)} ·{" "}
                      {COLLECTION_OUTCOME_LABELS[r.lastCall.outcome]}
                      {r.lastCall.promisedDate &&
                        ` → ${day(r.lastCall.promisedDate)}`}
                      {r.lastCall.note && (
                        <span className="block text-ink-faint">
                          “{r.lastCall.note}”
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-faint">—</span>
                  )}
                </Td>
                <Td align="right">
                  <Button size="sm" variant="secondary" onClick={() => setCalling(r)}>
                    Arama kaydı
                  </Button>
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <div className="px-4 pb-3">
          <ShowMore
            visible={page.visible.length}
            total={page.total}
            hidden={page.hidden}
            onMore={page.showMore}
            noun="cari"
          />
        </div>
      </Panel>

      {calling && (
        <CallForm
          row={calling}
          onClose={() => setCalling(null)}
          onSaved={() => {
            setCalling(null);
            void qc.invalidateQueries({ queryKey: ["collection-worklist"] });
            notify("Arama kaydedildi");
          }}
        />
      )}
    </div>
  );
}

/** Arama sonucu penceresi. */
function CallForm({
  row,
  onClose,
  onSaved,
}: {
  row: WorklistRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [outcome, setOutcome] = useState<CollectionOutcome>("PROMISED");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(row.overdue);
  const [note, setNote] = useState("");

  const needsDate = outcome === "PROMISED" || outcome === "CHEQUE";

  const save = useMutation({
    mutationFn: () =>
      apiPost("/api/collection-calls", {
        companyId: row.companyId,
        outcome,
        promisedDate: needsDate ? date : null,
        promisedAmount: needsDate && amount ? Number(amount) : null,
        note: note.trim() || null,
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal title={`${row.companyName} — arama kaydı`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="call-outcome">Sonuç</Label>
          <Select
            id="call-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as CollectionOutcome)}
          >
            {CollectionOutcomeEnum.options.map((o) => (
              <option key={o} value={o}>
                {COLLECTION_OUTCOME_LABELS[o]}
              </option>
            ))}
          </Select>
        </div>

        {/* Tarih yalnızca söz verilen sonuçlarda: tarihsiz bir söz listeyi hiç
            değiştirmez ve müşteri yarın yine aranır. */}
        {needsDate && (
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor="call-date">Söz verilen gün</Label>
              <TextInput
                id="call-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div>
              <Label htmlFor="call-amount" hint="opsiyonel">
                Tutar
              </Label>
              <TextInput
                id="call-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="call-note">Not</Label>
          <TextArea
            id="call-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Muhasebeci izinde, cuma tekrar aranacak…"
          />
        </div>

        <ErrorLine error={save.error} />

        <div className="flex items-center gap-3">
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Kaydet
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
        </div>

        <p className="text-xs text-ink-faint">
          Arama kaydı <strong>tahsilat değildir</strong>: para geldiğinde
          tahsilatı ayrıca girin. Kayıt düzeltilemez — yanlışsa üstüne yeni bir
          arama yazın, son söz onun olur.
        </p>
      </div>
    </Modal>
  );
}
