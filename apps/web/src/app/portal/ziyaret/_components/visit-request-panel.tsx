"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  VISIT_REQUEST_STATUS_LABELS,
  type VisitRequestStatus,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";
import { Button, ErrorLine, Label, TextInput } from "@/components/form";

// Bayinin "uğrayın" çağrısı.
//
// Çağrı, plasiyerin o günkü ziyaret listesine düşer. Aynı firmanın ikinci
// çağrısı yeni satır açmaz, mevcut çağrıyı günceller — sunucu tarafında
// hallediliyor; burada tekrar basan kullanıcıya engel çıkarılmıyor, çünkü
// "gelmediniz" demek meşru bir davranış.

interface VisitRequestRow {
  id: string;
  requestedFor: string | null;
  note: string | null;
  status: VisitRequestStatus;
  createdAt: string;
  completedAt: string | null;
}

function trDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("tr-TR") : "—";
}

export function VisitRequestPanel({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const list = useQuery({
    queryKey: ["my-visit-requests", companyId],
    queryFn: () =>
      apiGet<{ requests: VisitRequestRow[] }>(
        `/api/visit-requests?companyId=${companyId}&status=OPEN&status=PLANNED&status=DONE`,
      ),
  });

  const send = useMutation({
    mutationFn: () =>
      apiPost("/api/visit-requests", {
        companyId,
        requestedFor: day || undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      setNote("");
      setDay("");
      setError(null);
      setDone(true);
      void qc.invalidateQueries({ queryKey: ["my-visit-requests"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-1 text-headline-sm text-ink">Temsilcinizi çağırın</h2>
        <p className="mb-3 text-body-sm text-ink-muted">
          Çağrınız satış temsilcinizin o günkü ziyaret listesine düşer.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="visit-day" hint="(isteğe bağlı)">
              Tercih ettiğiniz gün
            </Label>
            <TextInput
              id="visit-day"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="visit-note">Not</Label>
            <TextInput
              id="visit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Örn. sipariş vereceğiz, numune isteriz"
            />
          </div>
        </div>

        <Button
          className="mt-3"
          loading={send.isPending}
          onClick={() => send.mutate()}
        >
          {send.isPending ? "Gönderiliyor…" : "Ziyaret çağrısı gönder"}
        </Button>

        {done && !error && (
          <p className="mt-2 text-body-sm text-positive">Çağrınız iletildi.</p>
        )}
        <ErrorLine error={error} />
      </Card>

      <section>
        <h2 className="mb-3 text-headline-sm text-ink">Çağrılarınız</h2>
        {list.isLoading ? (
          <LoadingState />
        ) : (list.data?.requests.length ?? 0) === 0 ? (
          <EmptyState label="Henüz çağrı göndermediniz." />
        ) : (
          <ul className="space-y-2">
            {list.data!.requests.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-body-sm text-ink">
                        İstenen gün: {trDate(r.requestedFor)}
                      </p>
                      {r.note && (
                        <p className="text-body-sm text-ink-muted">
                          “{r.note}”
                        </p>
                      )}
                      <p className="text-xs text-ink-faint">
                        Gönderildi: {trDate(r.createdAt)}
                        {r.completedAt
                          ? ` · Ziyaret: ${trDate(r.completedAt)}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      tone={
                        r.status === "DONE"
                          ? "success"
                          : r.status === "OPEN"
                            ? "warning"
                            : "info"
                      }
                    >
                      {VISIT_REQUEST_STATUS_LABELS[r.status]}
                    </Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
