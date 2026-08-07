"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Phone, Printer } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";

// Teslimat listesi. İki kullanıcıya birden hizmet ediyor:
//  - dağıtımı yapan (orders.fulfil): kurye atar, hepsini görür,
//  - kurye (delivery.confirm): yalnızca kendi işini görür ve teslim eder.
// Tek bileşen çünkü liste ikisi için de aynı; fark yalnızca hangi düğmelerin
// çıktığı. İki ayrı ekran olsaydı satır düzeni zamanla ayrışırdı.

interface Delivery {
  shipmentId: string;
  documentNumber: string;
  orderId: string;
  orderNumber: string;
  companyName: string;
  companyPhone: string | null;
  addressLine: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  shippedAt: string;
  courierId: string | null;
  courierName: string | null;
  deliveredAt: string | null;
  receivedByName: string | null;
  proofPhotoUrl: string | null;
  deliveryNote: string | null;
  itemCount: number;
  grandTotal: string;
}

interface Courier {
  id: string;
  name: string;
  email: string;
}

function trDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Yol tarifi bağlantısı.
 *
 * Koordinat varsa ona, yoksa yazılı adrese göre açılır — telefon hangi harita
 * uygulaması kuruluysa onu açar. Uygulama gömmek yerine bağlantı vermek
 * bilerek: kuryenin alışkın olduğu uygulamayı değiştirmeye çalışmak işi
 * yavaşlatır.
 */
function directionsUrl(d: Delivery): string {
  const dest =
    d.latitude != null && d.longitude != null
      ? `${d.latitude},${d.longitude}`
      : [d.addressLine, d.district, d.city].filter(Boolean).join(" ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

export function DeliveryBoard({ canDispatch }: { canDispatch: boolean }) {
  const qc = useQueryClient();
  const [showDelivered, setShowDelivered] = useState(false);

  const list = useQuery({
    queryKey: ["deliveries", showDelivered],
    queryFn: () =>
      apiGet<{ deliveries: Delivery[]; couriers: Courier[] }>(
        `/api/deliveries${showDelivered ? "?delivered=1" : ""}`,
      ),
  });

  const assign = useMutation({
    mutationFn: (v: { id: string; courierId: string | null }) =>
      apiPatch(`/api/deliveries/${v.id}`, { courierId: v.courierId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });

  if (list.isLoading) return <LoadingState />;
  if (list.isError) {
    return <p className="text-sm text-red-600">{(list.error as Error).message}</p>;
  }

  const deliveries = list.data!.deliveries;
  const couriers = list.data!.couriers;

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showDelivered}
          onChange={(e) => setShowDelivered(e.target.checked)}
        />
        Teslim edilenleri de göster
      </label>

      {deliveries.length === 0 ? (
        <EmptyState label="Bekleyen teslimat yok." />
      ) : (
        <div className="space-y-3">
          {deliveries.map((d) => (
            <Card key={d.shipmentId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{d.companyName}</p>
                  <p className="text-sm text-neutral-500">
                    İrsaliye {d.documentNumber} · Sipariş {d.orderNumber} ·{" "}
                    {d.itemCount} kalem · {formatTRY(d.grandTotal)}
                  </p>
                  {d.addressLine && (
                    <p className="mt-1 text-sm text-neutral-500">
                      {d.addressLine}
                      {d.district ? ` · ${d.district}` : ""}
                      {d.city ? ` / ${d.city}` : ""}
                    </p>
                  )}
                </div>
                {d.deliveredAt ? (
                  <Badge tone="success">
                    Teslim: {trDateTime(d.deliveredAt)}
                  </Badge>
                ) : d.courierName ? (
                  <Badge tone="info">Kurye: {d.courierName}</Badge>
                ) : (
                  <Badge tone="warning">Atanmadı</Badge>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={directionsUrl(d)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Yol tarifi
                </a>
                {d.companyPhone && (
                  <a
                    href={`tel:${d.companyPhone}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {d.companyPhone}
                  </a>
                )}
                <Link
                  href={`/documents/labels?kind=DELIVERY_RECEIPT&shipments=${d.shipmentId}`}
                  target="_blank"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Teslim fişi
                </Link>
                <Link
                  href={`/documents/labels?kind=CARGO_LABEL&shipments=${d.shipmentId}`}
                  target="_blank"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Kargo etiketi
                </Link>
                <Link
                  href={`/documents/shipments/${d.shipmentId}`}
                  target="_blank"
                  className="inline-flex h-8 items-center rounded-md border border-neutral-300 px-2.5 text-xs dark:border-neutral-700"
                >
                  İrsaliye
                </Link>

                {canDispatch && !d.deliveredAt && (
                  <select
                    value={d.courierId ?? ""}
                    onChange={(e) =>
                      assign.mutate({
                        id: d.shipmentId,
                        courierId: e.target.value || null,
                      })
                    }
                    className="h-8 rounded-md border border-neutral-300 px-2 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <option value="">Kurye seç…</option>
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {d.deliveredAt ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Teslim alan: {d.receivedByName ?? "—"}
                  {d.deliveryNote ? ` · ${d.deliveryNote}` : ""}
                  {d.proofPhotoUrl && (
                    <>
                      {" · "}
                      <a
                        href={d.proofPhotoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        imzalı belge
                      </a>
                    </>
                  )}
                </p>
              ) : (
                <ConfirmForm shipmentId={d.shipmentId} />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Teslim formu.
 *
 * İmzalı belgenin fotoğrafı zorunlu değil ama isteniyor: bazı teslimatlarda
 * kâğıt hiç imzalanmıyor (kapıda ödeme, kurumsal depo girişi) ve zorunlu bir
 * alan bu durumda kuryeyi sahte kayıt girmeye iter. Kim teslim aldı sorusu ise
 * zorunlu — imzasız da olsa bir isim yazılmalı.
 */
function ConfirmForm({ shipmentId }: { shipmentId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const confirm = useMutation({
    mutationFn: () =>
      apiPost(`/api/deliveries/${shipmentId}`, {
        receivedByName: name,
        proofPhotoUrl: photo || undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/deliveries/uploads", {
        method: "POST",
        body,
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Yükleme başarısız",
        );
      }
      setPhoto((data as { url: string }).url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 h-9 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        Teslim edildi
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">
            Teslim alan (zorunlu)
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ad soyad"
            className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">Not</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-neutral-500">
          İmzalı belgenin fotoğrafı
        </span>
        {/* capture: telefonda doğrudan kamerayı açar — kurye kapıda dosya
            seçicisiyle uğraşmasın. */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          className="text-xs"
        />
        {uploading && <span className="text-xs text-neutral-500">Yükleniyor…</span>}
        {photo && (
          <a
            href={photo}
            target="_blank"
            rel="noreferrer"
            className="ml-2 text-xs underline"
          >
            yüklendi
          </a>
        )}
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => confirm.mutate()}
          disabled={name.trim().length < 2 || confirm.isPending}
          className="h-9 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {confirm.isPending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-md border border-neutral-300 px-3 text-sm dark:border-neutral-700"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}
