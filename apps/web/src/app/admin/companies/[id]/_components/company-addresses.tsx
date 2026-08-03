"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { AddressRow } from "@repo/services";
import { apiDelete, apiPatch, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";

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
      }),
    onSuccess: () => {
      setForm({ label: "", line1: "", line2: "", city: "", district: "", postalCode: "" });
      setAdding(false);
      router.refresh();
    },
  });

  const makeDefault = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/admin/addresses/${id}`, { isDefault: true }),
    onSuccess: () => router.refresh(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/addresses/${id}`),
    onSuccess: () => router.refresh(),
  });

  return (
    <Panel
      title="Adresler"
      action={
        <Button onClick={() => setAdding((v) => !v)}>
          {adding ? "Vazgeç" : "Yeni adres"}
        </Button>
      }
    >
      {adding && (
        <div className="mb-4 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label>
              <Label hint="Merkez, Depo…">Etiket</Label>
              <TextInput value={form.label} onChange={(e) => set("label", e.target.value)} />
            </label>
            <label className="sm:col-span-2">
              <Label>Adres</Label>
              <TextInput value={form.line1} onChange={(e) => set("line1", e.target.value)} />
            </label>
            <label className="sm:col-span-2">
              <Label>Adres (2. satır)</Label>
              <TextInput value={form.line2} onChange={(e) => set("line2", e.target.value)} />
            </label>
            <label>
              <Label>Şehir</Label>
              <TextInput value={form.city} onChange={(e) => set("city", e.target.value)} />
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
          </div>
          <div className="mt-3">
            <Button
              disabled={
                create.isPending || !form.label.trim() || !form.line1.trim() || !form.city.trim()
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
        <p className="text-sm text-neutral-500">
          Adres yok. Sipariş sevkiyatı için en az bir adres tanımlayın.
        </p>
      ) : (
        <ul className="space-y-2">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {a.label}
                  {a.isDefault && (
                    <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      varsayılan
                    </span>
                  )}
                </p>
                <p className="text-neutral-500">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                  <br />
                  {a.district ? `${a.district}, ` : ""}
                  {a.city}
                  {a.postalCode ? ` ${a.postalCode}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {!a.isDefault && (
                  <Button
                    variant="secondary"
                    disabled={makeDefault.isPending}
                    onClick={() => makeDefault.mutate(a.id)}
                  >
                    Varsayılan yap
                  </Button>
                )}
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`"${a.label}" adresi silinsin mi?`)) remove.mutate(a.id);
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
