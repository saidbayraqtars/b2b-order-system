"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { AddressRow } from "@repo/services";
import { apiDelete, apiPatch, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
import { Badge } from "@/components/ui";

// Addresses of one company. Exactly one is the default — promoting one demotes
// the rest, and the server enforces that, so the UI just reflects it.

export function CompanyAddresses({
  companyId,
  addresses,
}: {
  companyId: string;
  addresses: AddressRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    label: "",
    line1: "",
    line2: "",
    city: "",
    district: "",
    postalCode: "",
    latitude: "",
    longitude: "",
  });
  const set = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/companies/${companyId}/addresses`, {
        label: form.label,
        line1: form.line1,
        line2: form.line2 || undefined,
        city: form.city,
        district: form.district || undefined,
        postalCode: form.postalCode || undefined,
        // Boş bırakılabilir; girilirse ziyaret haritası ve yol tarifi bu
        // noktayı kullanır.
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      }),
    onSuccess: () => {
      setForm({
        label: "",
        line1: "",
        line2: "",
        city: "",
        district: "",
        postalCode: "",
        latitude: "",
        longitude: "",
      });
      setAdding(false);
      router.refresh();
    },
  });

  const makeDefault = useMutation({
    mutationFn: (id: string) =>
      apiPatch(`/api/admin/addresses/${id}`, { isDefault: true }),
    onSuccess: () => router.refresh(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/addresses/${id}`),
    onSuccess: () => router.refresh(),
  });

  return (
    <Panel
      title="Adresler"
      collapsible
      defaultOpen={false}
      summary={addresses.length === 0 ? "yok" : `${addresses.length} adres`}
      action={
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "Vazgeç" : "Yeni adres"}
        </Button>
      }
    >
      {adding && (
        <div className="mb-4 rounded border border-line bg-sunken p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label>
              <Label hint="Merkez, Depo…">Etiket</Label>
              <TextInput
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <Label>Adres</Label>
              <TextInput
                value={form.line1}
                onChange={(e) => set("line1", e.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <Label>Adres (2. satır)</Label>
              <TextInput
                value={form.line2}
                onChange={(e) => set("line2", e.target.value)}
              />
            </label>
            <label>
              <Label>Şehir</Label>
              <TextInput
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </label>
            <label>
              <Label>İlçe</Label>
              <TextInput
                value={form.district}
                onChange={(e) => set("district", e.target.value)}
              />
            </label>
            <label>
              <Label>Posta kodu</Label>
              <TextInput
                value={form.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
              />
            </label>
            <label>
              <Label hint="Haritadan kopyalanır, zorunlu değil">Enlem</Label>
              <TextInput
                value={form.latitude}
                inputMode="decimal"
                placeholder="41.0151"
                onChange={(e) => set("latitude", e.target.value)}
              />
            </label>
            <label>
              <Label hint="Haritadan kopyalanır, zorunlu değil">Boylam</Label>
              <TextInput
                value={form.longitude}
                inputMode="decimal"
                placeholder="28.9795"
                onChange={(e) => set("longitude", e.target.value)}
              />
            </label>
          </div>
          <div className="mt-3">
            <Button
              size="sm"
              disabled={
                create.isPending ||
                !form.label.trim() ||
                !form.line1.trim() ||
                !form.city.trim()
              }
              onClick={() => create.mutate()}
            >
              Ekle
            </Button>
          </div>
          <ErrorLine error={create.error} />
        </div>
      )}

      {addresses.length === 0 ? (
        <p className="text-body-sm text-ink-faint">
          Adres yok. Sipariş sevkiyatı için en az bir adres tanımlayın.
        </p>
      ) : (
        <ul className="space-y-2">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded border border-line p-3"
            >
              <div className="text-body-sm">
                <p className="flex items-center gap-2 font-medium text-ink">
                  {a.label}
                  {a.isDefault && <Badge tone="brand">Varsayılan</Badge>}
                </p>
                <p className="text-ink-muted">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                  <br />
                  {a.district ? `${a.district}, ` : ""}
                  {a.city}
                  {a.postalCode ? ` ${a.postalCode}` : ""}
                </p>
                {/* Koordinat, ziyaret haritasının tek girdisi. Eksikse
                    plasiyer haritada pin göremez — bunu burada söylemek,
                    sahada fark edilmesinden iyidir. */}
                <p className="mt-1 text-xs text-ink-faint">
                  {a.latitude != null && a.longitude != null
                    ? `Konum: ${a.latitude}, ${a.longitude}`
                    : "Konum girilmedi — haritada görünmez"}
                </p>
              </div>
              <div className="flex gap-1">
                {!a.isDefault && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={makeDefault.isPending}
                    onClick={() => makeDefault.mutate(a.id)}
                  >
                    Varsayılan yap
                  </Button>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`"${a.label}" adresi silinsin mi?`))
                      remove.mutate(a.id);
                  }}
                >
                  Sil
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorLine error={makeDefault.error ?? remove.error} />
    </Panel>
  );
}
