"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VISIT_REQUEST_STATUS_LABELS, type VisitRequestStatus } from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";

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
        <h2 className="mb-1 text-sm font-semibold">Temsilcinizi çağırın</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Çağrınız satış temsilcinizin o günkü ziyaret listesine düşer.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-fg-muted">
              Tercih ettiğiniz gün (isteğe bağlı)
            </span>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="h-9 w-full rounded-md border border-border-strong bg-surface2 px-2 text-sm text-fg"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fg-muted">Not</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Örn. sipariş vereceğiz, numune isteriz"
              className="h-9 w-full rounded-md border border-border-strong bg-surface2 px-2 text-sm text-fg"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => send.mutate()}
          disabled={send.isPending}
          className="mt-3 h-9 rounded-md bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50"
        >
          {send.isPending ? "Gönderiliyor…" : "Ziyaret çağrısı gönder"}
        </button>

        {done && !error && (
          <p className="mt-2 text-sm text-success">Çağrınız iletildi.</p>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Çağrılarınız</h2>
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
                      <p className="text-sm">
                        İstenen gün: {trDate(r.requestedFor)}
                      </p>
                      {r.note && (
                        <p className="text-sm text-fg-muted">“{r.note}”</p>
                      )}
                      <p className="text-xs text-fg-muted">
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
