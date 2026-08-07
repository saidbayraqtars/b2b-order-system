"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, MapPin, Navigation, Phone } from "lucide-react";
import { VISIT_REQUEST_STATUS_LABELS, type VisitRequestStatus } from "@repo/types";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";

// Günün ziyaret planı: bayinin açtığı çağrılar, elle sıralama ve harita.
//
// Sıra sunucuda tutuluyor (VisitRequest.sortIndex), tarayıcıda değil: plasiyer
// sabah masaüstünde plan yapıp gün içinde telefondan bakıyor, iki cihazda iki
// farklı sıra görmek planı işe yaramaz hâle getirir.

interface VisitRequestRow {
  id: string;
  companyId: string;
  companyName: string;
  city: string | null;
  district: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  requestedFor: string | null;
  note: string | null;
  status: VisitRequestStatus;
  sortIndex: number;
  createdAt: string;
}

function trDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("tr-TR") : "—";
}

/** Tek durak için yol tarifi. Koordinat varsa ona, yoksa yazılı adrese. */
function destinationOf(r: VisitRequestRow): string {
  return r.latitude != null && r.longitude != null
    ? `${r.latitude},${r.longitude}`
    : [r.addressLine, r.district, r.city].filter(Boolean).join(" ");
}

function directionsUrl(r: VisitRequestRow): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destinationOf(r),
  )}`;
}

/**
 * Tüm durakları **listedeki sırayla** açan yol tarifi.
 *
 * Son durak hedef, aradakiler ara nokta. Sırayı harita değil plasiyer
 * belirliyor: rota optimizasyonu trafiği bilir ama randevuyu, öğle molasını ve
 * "şu bayi öğleden sonra açık" bilgisini bilmez.
 */
function routeUrl(rows: VisitRequestRow[]): string | null {
  const stops = rows.map(destinationOf).filter(Boolean);
  if (stops.length === 0) return null;
  const destination = stops[stops.length - 1]!;
  const waypoints = stops.slice(0, -1);
  const wp = waypoints.length
    ? `&waypoints=${encodeURIComponent(waypoints.join("|"))}`
    : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination,
  )}${wp}&travelmode=driving`;
}

export function VisitPlan() {
  const qc = useQueryClient();
  const [order, setOrder] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["visit-requests"],
    queryFn: () =>
      apiGet<{ requests: VisitRequestRow[] }>(
        `/api/visit-requests?day=${new Date().toISOString().slice(0, 10)}`,
      ),
  });

  // Sunucudan gelen sıra temel; elle taşıma sırasında yerel sıra öne geçer ve
  // kaydedildiğinde ikisi tekrar aynı olur.
  const rows = useMemo(() => {
    const data = list.data?.requests ?? [];
    if (!order) return data;
    const byId = new Map(data.map((r) => [r.id, r]));
    const ordered = order.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    const rest = data.filter((r) => !order.includes(r.id));
    return [...ordered, ...rest];
  }, [list.data, order]);

  const saveOrder = useMutation({
    mutationFn: (ids: string[]) => apiPost("/api/visit-requests/reorder", { ids }),
    onSuccess: () => {
      setOrder(null);
      void qc.invalidateQueries({ queryKey: ["visit-requests"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: VisitRequestStatus }) =>
      apiPatch(`/api/visit-requests/${v.id}`, { status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit-requests"] }),
    onError: (e) => setError((e as Error).message),
  });

  function move(index: number, delta: number) {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    if (row) next.splice(target, 0, row);
    setOrder(next.map((r) => r.id));
  }

  if (list.isLoading) return <LoadingState />;
  if (list.isError) {
    return <p className="text-sm text-red-600">{(list.error as Error).message}</p>;
  }

  const route = routeUrl(rows);
  const focus = rows.find((r) => r.id === selected) ?? rows[0] ?? null;

  return (
    <section className="mb-8 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Bugünün ziyaret listesi</h2>
          <p className="text-xs text-neutral-500">
            Sizi çağıran bayiler. Sırayı siz belirlersiniz.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {order && (
            <button
              type="button"
              onClick={() => saveOrder.mutate(order)}
              disabled={saveOrder.isPending}
              className="h-8 rounded-md bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saveOrder.isPending ? "Kaydediliyor…" : "Sırayı kaydet"}
            </button>
          )}
          {route && (
            <a
              href={route}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-3 text-xs dark:border-neutral-700"
            >
              <Navigation className="h-3.5 w-3.5" />
              Rotayı aç
            </a>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <EmptyState label="Bugün için çağrı yok." />
      ) : (
        <>
          <MapPanel row={focus} />

          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      className="min-w-0 text-left"
                    >
                      <p className="font-medium">
                        <span className="mr-2 text-neutral-400">{i + 1}.</span>
                        {r.companyName}
                      </p>
                      {r.addressLine && (
                        <p className="text-sm text-neutral-500">
                          {r.addressLine}
                          {r.district ? ` · ${r.district}` : ""}
                          {r.city ? ` / ${r.city}` : ""}
                        </p>
                      )}
                      {r.note && (
                        <p className="mt-1 text-sm text-neutral-500">“{r.note}”</p>
                      )}
                      <p className="mt-1 text-xs text-neutral-400">
                        İstenen gün: {trDate(r.requestedFor)}
                        {r.latitude == null && " · konum kayıtlı değil"}
                      </p>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <Badge tone={r.status === "OPEN" ? "warning" : "info"}>
                        {VISIT_REQUEST_STATUS_LABELS[r.status]}
                      </Badge>
                      <button
                        type="button"
                        aria-label="Yukarı taşı"
                        onClick={() => move(i, -1)}
                        className="rounded border border-neutral-300 p-1 dark:border-neutral-700"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Aşağı taşı"
                        onClick={() => move(i, 1)}
                        className="rounded border border-neutral-300 p-1 dark:border-neutral-700"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={directionsUrl(r)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Yol tarifi
                    </a>
                    {r.phone && (
                      <a
                        href={`tel:${r.phone}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {r.phone}
                      </a>
                    )}
                    <Link
                      href={`/rep/ziyaret?companyId=${r.companyId}`}
                      className="inline-flex h-8 items-center rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
                    >
                      Ziyareti aç
                    </Link>
                    {r.status === "OPEN" && (
                      <button
                        type="button"
                        onClick={() => setStatus.mutate({ id: r.id, status: "PLANNED" })}
                        className="h-8 rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
                      >
                        Güne al
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setStatus.mutate({ id: r.id, status: "CANCELLED" })}
                      className="h-8 rounded-md px-2.5 text-xs text-red-600 hover:underline"
                    >
                      İptal
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/**
 * Seçili durağın haritası.
 *
 * OpenStreetMap'in gömme görünümü kullanılıyor; harita kütüphanesi
 * eklenmiyor. Sebep basit: ekranda ihtiyaç duyulan şey "burası neresi" ve
 * "oraya nasıl giderim" — ikisi de gömme harita ve yol tarifi bağlantısıyla
 * karşılanıyor. Sürüklenebilir bir harita motoru, gerçek bir ihtiyaç çıkana
 * kadar taşınacak fazladan bir bağımlılık olurdu.
 *
 * Koordinatı olmayan adres için harita çizilmez, bunun yerine nedeni yazılır:
 * boş bir gri kutu, kullanıcıyı bozuk olduğunu düşünmeye iter.
 */
function MapPanel({ row }: { row: VisitRequestRow | null }) {
  if (!row) return null;

  if (row.latitude == null || row.longitude == null) {
    return (
      <Card>
        <p className="text-sm text-neutral-500">
          <strong>{row.companyName}</strong> için konum kayıtlı değil. Firma
          adresine koordinat girildiğinde harita burada görünür — yol tarifi
          yazılı adresle yine çalışıyor.
        </p>
      </Card>
    );
  }

  const d = 0.006; // ~600 m'lik pencere
  const bbox = [
    row.longitude - d,
    row.latitude - d,
    row.longitude + d,
    row.latitude + d,
  ].join(",");

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
      <iframe
        title={`${row.companyName} konumu`}
        className="h-64 w-full"
        loading="lazy"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${row.latitude},${row.longitude}`}
      />
      <p className="px-3 py-2 text-xs text-neutral-500">
        {row.companyName} · {row.district ?? ""} {row.city ?? ""}
      </p>
    </div>
  );
}
