"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReconciliationRow } from "@repo/services";
import {
  RECONCILIATION_STATUS_LABELS,
  type ReconciliationStatus,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import {
  Button,
  ErrorLine,
  Panel,
  TextArea,
  WarnLine,
} from "@/components/form";
import { Badge, type BadgeTone } from "@/components/ui";
import { useToast } from "@/components/toast";

// Mutabakat — alıcı tarafı.
//
// Ekstrenin **üstünde** duruyor, ayrı bir sayfada değil: mutabakat bir bakiye
// hakkında ve müşteri o bakiyeye zaten burada bakıyor. Ayrı bir menü maddesi,
// yılda iki kez kullanılan bir ekranı her gün göstermek olurdu.
//
// Cevap verilmemiş mektup yoksa **hiçbir şey çizilmiyor**: dönem arası bir
// ekstre ekranında "mutabakat yok" yazan bir kutu, gürültüden başka bir şey
// değil.

const TONE: Record<ReconciliationStatus, BadgeTone> = {
  SENT: "warning",
  AGREED: "success",
  DISPUTED: "danger",
  CANCELLED: "neutral",
};

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function ReconciliationPanel({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [note, setNote] = useState("");
  const [disputing, setDisputing] = useState(false);

  const query = useQuery({
    queryKey: ["reconciliations", "mine", companyId],
    queryFn: () =>
      apiGet<{ reconciliations: ReconciliationRow[] }>(
        `/api/reconciliations?companyId=${companyId}`,
      ),
  });

  const respond = useMutation({
    mutationFn: (input: { id: string; agreed: boolean }) =>
      apiPost(`/api/reconciliations/${input.id}`, {
        agreed: input.agreed,
        note: note.trim() || null,
      }),
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: ["reconciliations"] });
      setNote("");
      setDisputing(false);
      notify(input.agreed ? "Mutabakat onaylandı" : "İtirazınız iletildi");
    },
  });

  const rows = query.data?.reconciliations ?? [];
  const open = rows.find((r) => r.status === "SENT");
  // Cevaplanmışların en yenisi — "geçen dönem ne demiştik" sorusu için.
  const answered = rows.find(
    (r) => r.status === "AGREED" || r.status === "DISPUTED",
  );

  if (query.isLoading) return null;
  if (!open && !answered) return null;

  return (
    <div className="mb-5 flex flex-col gap-4">
      {open && (
        <Panel title="Cari mutabakat">
          <p className="text-body-sm text-ink">
            {day(open.periodStart)} – {day(open.periodEnd)} dönemi için
            kayıtlarımızda görünen bakiyeniz:{" "}
            <strong className="text-headline-sm">
              {formatTRY(Number(open.balance))}
            </strong>
          </p>
          <p className="mt-1 text-body-sm text-ink-muted">
            Dönem içi borç {formatTRY(Number(open.totalDebit))}, alacak{" "}
            {formatTRY(Number(open.totalCredit))}. Aşağıdaki ekstre bu dönemi de
            içeriyor — karşılaştırıp cevaplayın.
          </p>

          {disputing && (
            <div className="mt-4">
              <TextArea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Hangi kalemde anlaşamıyorsunuz? Tutar ve tarih yazın."
                aria-label="İtiraz gerekçesi"
              />
              <p className="mt-1 text-xs text-ink-faint">
                Gerekçe zorunlu: gerekçesiz bir itiraz cevaplanamaz.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="success"
              loading={respond.isPending && !disputing}
              onClick={() => respond.mutate({ id: open.id, agreed: true })}
            >
              Mutabıkım
            </Button>
            {disputing ? (
              <>
                <Button
                  variant="danger"
                  loading={respond.isPending}
                  disabled={note.trim().length === 0}
                  onClick={() => respond.mutate({ id: open.id, agreed: false })}
                >
                  İtirazı gönder
                </Button>
                <Button variant="ghost" onClick={() => setDisputing(false)}>
                  Vazgeç
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setDisputing(true)}>
                İtirazım var
              </Button>
            )}
          </div>

          <ErrorLine error={respond.error} />

          <WarnLine className="mt-4">
            <span>
              Cevabınız <strong>bir beyandır</strong>, hesabınızda bir düzeltme
              yapmaz. İtiraz ederseniz muhasebemiz sizinle iletişime geçer.
              Verilen cevap değiştirilemez.
            </span>
          </WarnLine>
        </Panel>
      )}

      {!open && answered && (
        <Panel title="Son mutabakat">
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
            <Badge tone={TONE[answered.status]}>
              {RECONCILIATION_STATUS_LABELS[answered.status]}
            </Badge>
            {day(answered.periodStart)} – {day(answered.periodEnd)} ·{" "}
            {formatTRY(Number(answered.balance))}
            {answered.respondedAt && ` · ${day(answered.respondedAt)}`}
          </p>
          {answered.responseNote && (
            <p className="mt-2 text-body-sm text-ink">
              “{answered.responseNote}”
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}
