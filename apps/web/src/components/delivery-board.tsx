"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Phone, Printer, Receipt } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  LinkButton,
  Select,
  TextInput,
} from "@/components/form";
import {
  Badge,
  Card,
  EmptyState,
  LoadingState,
  StatTile,
} from "@/components/ui";

// Teslimat listesi. İki kullanıcıya birden hizmet ediyor:
//  - dağıtımı yapan (orders.fulfil): kurye atar, hepsini görür,
//  - kurye (delivery.confirm): yalnızca kendi işini görür ve teslim eder.
// Tek bileşen çünkü liste ikisi için de aynı; fark yalnızca hangi düğmelerin
// çıktığı. İki ayrı ekran olsaydı satır düzeni zamanla ayrışırdı.
//
// Liste kart, tablo değil: satırın yarısı adres ve düğme — yol tarifi, telefon,
// üç ayrı basım. Bunlar hücreye sığmıyor ve satırın asıl işi kuryenin
// telefonunda yapılıyor; tablo orada yatay kaydırmaya dönüşürdü.

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
function directionsUrl(d: Delivery): string | null {
  const dest =
    d.latitude != null && d.longitude != null
      ? `${d.latitude},${d.longitude}`
      : [d.addressLine, d.district, d.city].filter(Boolean).join(" ");
  // Adressiz sevkiyatta düğme hiç çizilmiyor. Önce boş bir hedefle bağlantı
  // kuruluyordu: kurye kapıda düğmeye basıyor, harita hiçbir yeri göstermeyen
  // bir arama açıyordu. Adres yoksa söylenecek şey "yol tarifi" değil,
  // adresin olmadığı.
  if (!dest.trim()) return null;
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
  if (list.isError) return <ErrorLine error={list.error} />;

  const deliveries = list.data!.deliveries;
  const couriers = list.data!.couriers;

  return (
    <div className="space-y-5">
      {canDispatch && (
        <DispatchTiles rows={deliveries} showingDelivered={showDelivered} />
      )}

      <Checkbox
        checked={showDelivered}
        onChange={(e) => setShowDelivered(e.target.checked)}
        label="Teslim edilenleri de göster"
      />

      <ErrorLine error={assign.error} />

      {deliveries.length === 0 ? (
        <EmptyState label="Bekleyen teslimat yok." />
      ) : (
        <div className="space-y-3">
          {deliveries.map((d) => (
            <Card key={d.shipmentId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-headline-sm text-ink">{d.companyName}</p>
                  <p className="mt-0.5 text-body-sm text-ink-muted">
                    <span className="tech-num">{d.documentNumber}</span>
                    {" · "}
                    <span className="tech-num">{d.orderNumber}</span>
                    {` · ${d.itemCount} kalem · `}
                    <span className="tabular-nums">
                      {formatTRY(d.grandTotal)}
                    </span>
                  </p>
                  {d.addressLine ? (
                    <p className="mt-1 text-body-sm text-ink-faint">
                      {d.addressLine}
                      {d.district ? ` · ${d.district}` : ""}
                      {d.city ? ` / ${d.city}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1.5">
                      <Badge tone="warning">Sevk adresi yok</Badge>
                    </p>
                  )}
                </div>
                {d.deliveredAt ? (
                  <Badge tone="success">
                    Teslim {trDateTime(d.deliveredAt)}
                  </Badge>
                ) : d.courierName ? (
                  <Badge tone="info">Kurye: {d.courierName}</Badge>
                ) : (
                  <Badge tone="warning">Atanmadı</Badge>
                )}
              </div>

              {/* Yola çıkaran iki eylem çerçeveli, kâğıt bağlantıları
                  arkalarında sessiz. Beşi de aynı görünseydi kurye, kapıda
                  hangisine basacağını her seferinde okumak zorunda kalırdı. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {directionsUrl(d) && (
                  <LinkButton
                    href={directionsUrl(d)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Yol tarifi
                  </LinkButton>
                )}
                {d.companyPhone && (
                  <LinkButton href={`tel:${d.companyPhone}`}>
                    <Phone className="h-3.5 w-3.5" />
                    {d.companyPhone}
                  </LinkButton>
                )}

                <span className="flex flex-wrap items-center gap-1">
                  <LinkButton
                    variant="ghost"
                    href={`/documents/labels?kind=DELIVERY_RECEIPT&shipments=${d.shipmentId}`}
                    target="_blank"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Teslim fişi
                  </LinkButton>
                  <LinkButton
                    variant="ghost"
                    href={`/documents/labels?kind=CARGO_LABEL&shipments=${d.shipmentId}`}
                    target="_blank"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Kargo etiketi
                  </LinkButton>
                  <LinkButton
                    variant="ghost"
                    href={`/documents/shipments/${d.shipmentId}`}
                    target="_blank"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    İrsaliye
                  </LinkButton>
                </span>

                {canDispatch && !d.deliveredAt && (
                  <Select
                    size="sm"
                    aria-label="Kurye ata"
                    value={d.courierId ?? ""}
                    onChange={(e) =>
                      assign.mutate({
                        id: d.shipmentId,
                        courierId: e.target.value || null,
                      })
                    }
                    className="ml-auto w-auto"
                  >
                    <option value="">Kurye seç…</option>
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              {d.deliveredAt ? (
                <p className="mt-3 border-t border-line pt-2 text-xs text-ink-faint">
                  Teslim alan: {d.receivedByName ?? "—"}
                  {d.deliveryNote ? ` · ${d.deliveryNote}` : ""}
                  {d.proofPhotoUrl && (
                    <>
                      {" · "}
                      <a
                        href={d.proofPhotoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-ink"
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
 * Dağıtımı yapanın üç sayısı.
 *
 * Yalnızca `orders.fulfil` olanda çıkıyor: kuryenin telefonunda tek bir liste
 * var ve ekranın üstünü sayı kutularına vermek o listeyi ekran dışına iter.
 *
 * "Teslim edildi", süzgeç kapalıyken sayı değil tire gösteriyor. Sıfır yazsaydı
 * bugün hiç teslimat yapılmadığını söylerdi; oysa söyleyebileceği tek şey o
 * satırların hiç indirilmemiş olduğu.
 */
function DispatchTiles({
  rows,
  showingDelivered,
}: {
  rows: Delivery[];
  showingDelivered: boolean;
}) {
  const open = rows.filter((d) => !d.deliveredAt);
  const unassigned = open.filter((d) => !d.courierId).length;
  const delivered = rows.length - open.length;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile
        label="Kurye bekleyen"
        value={unassigned}
        tone={unassigned > 0 ? "caution" : "neutral"}
        hint={unassigned > 0 ? "atama yapılmadı" : "hepsi atandı"}
      />
      <StatTile label="Yolda" value={open.length - unassigned} />
      <StatTile
        label="Teslim edildi"
        value={showingDelivered ? delivered : "—"}
        hint={showingDelivered ? undefined : "listede gösterilmiyor"}
      />
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
      <Button className="mt-3" onClick={() => setOpen(true)}>
        Teslim edildi
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded border border-line bg-sunken p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`recv-${shipmentId}`} hint="zorunlu">
            Teslim alan
          </Label>
          <TextInput
            id={`recv-${shipmentId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ad soyad"
          />
        </div>
        <div>
          <Label htmlFor={`note-${shipmentId}`}>Not</Label>
          <TextInput
            id={`note-${shipmentId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`proof-${shipmentId}`}>İmzalı belgenin fotoğrafı</Label>
        {/* capture: telefonda doğrudan kamerayı açar — kurye kapıda dosya
            seçicisiyle uğraşmasın. */}
        <input
          id={`proof-${shipmentId}`}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          className="block w-full text-xs text-ink-muted file:mr-3 file:h-8 file:cursor-pointer file:rounded file:border file:border-line file:bg-panel file:px-3 file:text-xs file:font-medium file:text-ink-muted hover:file:bg-subtle"
        />
        {uploading && (
          <span className="mt-1 block text-xs text-ink-faint">Yükleniyor…</span>
        )}
        {photo && (
          <a
            href={photo}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-xs text-ink-muted underline hover:text-ink"
          >
            yüklendi — aç
          </a>
        )}
      </div>

      <ErrorLine error={error} />

      <div className="flex gap-2">
        <Button
          onClick={() => confirm.mutate()}
          disabled={name.trim().length < 2}
          loading={confirm.isPending}
        >
          Kaydet
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
