"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, LogOut, MapPin } from "lucide-react";
import type { CheckInRecord } from "@repo/services";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
import { Badge, EmptyState, LoadingState } from "@/components/ui";

interface Coords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Ziyaret aç / kapat + geçmiş.
 *
 * Konum burada **kanıt değil, not**: tarayıcının verdiği konum masaüstünde
 * çoğu zaman IP tahminidir. Bu yüzden konum zorunlu tutulmuyor (izin
 * verilmemesi ziyareti engellemez) ve sunucu kaydı "WEB" olarak işaretliyor —
 * telefonun kapıda aldığı GPS ölçümüyle aynı şey değil, raporda da öyle
 * görünmeli.
 */
export function VisitPanel({
  companyId,
  companyName,
}: {
  companyId: string | null;
  companyName: string | null;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  const key = ["checkins", companyId ?? "all"] as const;
  const visits = useQuery({
    queryKey: key,
    queryFn: () =>
      apiGet<{ checkIns: CheckInRecord[]; open: CheckInRecord | null }>(
        `/api/checkins${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`,
      ),
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["checkins"] });
  }

  const start = useMutation({
    mutationFn: () =>
      apiPost<{ checkIn: CheckInRecord }>("/api/checkins", {
        companyId,
        note: note.trim() || undefined,
        ...(coords
          ? { latitude: coords.latitude, longitude: coords.longitude }
          : {}),
      }),
    onSuccess: () => {
      setNote("");
      setCoords(null);
      refresh();
    },
  });

  const close = useMutation({
    mutationFn: (id: string) =>
      apiPost<{ checkIn: CheckInRecord }>(`/api/checkins/${id}/checkout`, {}),
    onSuccess: refresh,
  });

  function locate() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Tarayıcı konum desteklemiyor.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => {
        setGeoBusy(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Konum izni verilmedi — ziyaret konumsuz kaydedilebilir."
            : "Konum alınamadı — ziyaret konumsuz kaydedilebilir.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const open = visits.data?.open ?? null;

  return (
    <div className="space-y-6">
      {open && (
        <OpenVisit
          visit={open}
          onClose={() => close.mutate(open.id)}
          closing={close.isPending}
          error={close.error}
        />
      )}

      {!open && (
        <Panel title="Yeni ziyaret">
          {!companyId ? (
            <p className="text-sm text-neutral-500">
              Ziyaret açmak için üstteki seçiciden firma seçin. Aşağıdaki geçmiş
              firma seçilmeden de okunur.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-neutral-500">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  {companyName}
                </span>{" "}
                ziyareti açılacak. Tarayıcıdan açılan ziyaretler kayıtta{" "}
                <strong>WEB</strong> olarak işaretlenir.
              </p>

              <Label htmlFor="ziyaret-not" hint="(opsiyonel)">
                Not
              </Label>
              <TextInput
                id="ziyaret-not"
                placeholder="Örn. numune bırakıldı, sipariş görüşülecek"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={geoBusy}
                  onClick={locate}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  {coords ? "Konumu yenile" : "Konumu ekle"}
                </Button>
                {coords && (
                  <span className="text-xs tabular-nums text-neutral-500">
                    {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)} (±
                    {coords.accuracy} m)
                  </span>
                )}
              </div>
              {geoError && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  {geoError}
                </p>
              )}

              <div className="mt-4">
                <Button loading={start.isPending} onClick={() => start.mutate()}>
                  <MapPin className="h-4 w-4" />
                  Ziyareti başlat
                </Button>
              </div>
              <ErrorLine error={start.error} />
            </>
          )}
        </Panel>
      )}

      <Panel
        title={companyId ? `${companyName} ziyaretleri` : "Son ziyaretlerim"}
        action={
          companyId ? (
            <Link
              href="/rep/ziyaret"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Tümü
            </Link>
          ) : undefined
        }
      >
        {visits.isLoading ? (
          <LoadingState />
        ) : visits.isError ? (
          <ErrorLine error={visits.error} />
        ) : visits.data!.checkIns.length === 0 ? (
          <EmptyState label="Ziyaret kaydı yok." />
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {visits.data!.checkIns.map((v) => (
              <VisitRow key={v.id} visit={v} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/**
 * Açık ziyaret — ekranın en üstünde, geçen süreyle birlikte.
 *
 * Süre canlı sayıyor çünkü açık kalmış bir ziyaret sessizce durursa fark
 * edilmez; sunucu da yeni ziyaret açmayı reddettiği için kullanıcı sebebini
 * burada görmeli.
 */
function OpenVisit({
  visit,
  onClose,
  closing,
  error,
}: {
  visit: CheckInRecord;
  onClose: () => void;
  closing: boolean;
  error: unknown;
}) {
  const elapsed = useElapsed(visit.checkInAt);

  return (
    <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Açık ziyaret
          </p>
          <p className="mt-0.5 font-semibold">{visit.companyName}</p>
          <p className="mt-0.5 text-xs text-emerald-800 tabular-nums dark:text-emerald-300">
            {new Date(visit.checkInAt).toLocaleString("tr-TR")} · {elapsed}
          </p>
        </div>
        <Button variant="success" loading={closing} onClick={onClose}>
          <LogOut className="h-4 w-4" />
          Ziyareti kapat
        </Button>
      </div>
      <ErrorLine error={error} />
    </section>
  );
}

function VisitRow({ visit }: { visit: CheckInRecord }) {
  const minutes =
    visit.checkOutAt === null
      ? null
      : Math.max(
          0,
          Math.round(
            (new Date(visit.checkOutAt).getTime() -
              new Date(visit.checkInAt).getTime()) /
              60_000,
          ),
        );

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {visit.companyName}
          <Badge tone={visit.source === "MOBILE" ? "brand" : "neutral"}>
            {visit.source === "MOBILE" ? "Mobil" : "Web"}
          </Badge>
          {visit.checkOutAt === null && <Badge tone="success">Açık</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {new Date(visit.checkInAt).toLocaleString("tr-TR")}
          {minutes !== null ? ` · ${minutes} dk` : ""}
          {visit.note ? ` · ${visit.note}` : ""}
        </p>
      </div>
      {visit.latitude !== null && visit.longitude !== null && (
        <a
          href={`https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          <MapPin className="h-3.5 w-3.5" />
          Haritada
        </a>
      )}
    </li>
  );
}

/** "1 sa 12 dk" — açık ziyaretin süresi, dakikada bir tazelenir. */
function useElapsed(since: string): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} sa ${minutes % 60} dk` : `${minutes} dk`;
}
