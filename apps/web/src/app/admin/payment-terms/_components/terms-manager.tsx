"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentTermRow } from "@repo/services";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { Disclosure } from "@/components/disclosure";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
import { Badge, EmptyState, LoadingState } from "@/components/ui";

// Vade definitions are global; which customer may pick which is set per company
// on the firm's own screen. A term any customer is on cannot be deleted — the
// service refuses and asks for it to be deactivated, so the orders sold on that
// term stay explainable.

export function TermsManager() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [days, setDays] = useState("");

  const query = useQuery({
    queryKey: ["admin-payment-terms"],
    queryFn: () =>
      apiGet<{ terms: PaymentTermRow[] }>("/api/admin/payment-terms"),
  });
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["admin-payment-terms"] });

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/payment-terms", { name, days: Number(days) }),
    onSuccess: () => {
      setName("");
      setDays("");
      invalidate();
    },
  });

  const daysValid = days.trim() !== "" && Number.isFinite(Number(days));

  return (
    <Panel title="Tanımlar" bodyClassName="p-0">
      {/* Ekleme şeridi gömük zeminde: tablo başlığıyla aynı yüzey, altındaki
          listeden bir çizgiyle ayrılıyor. */}
      <div className="border-b border-line bg-sunken px-4 py-3">
        <Disclosure label="+ Yeni vade" storageKey="payment-terms:new">
          <div className="flex flex-wrap items-end gap-2 pb-1">
            <label>
              <Label>Vade adı</Label>
              <TextInput
                value={name}
                placeholder="30 gün, Peşin…"
                onChange={(e) => setName(e.target.value)}
                className="w-48"
              />
            </label>
            <label>
              <Label hint="0 = peşin">Gün</Label>
              <TextInput
                type="number"
                min={0}
                max={365}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-24"
              />
            </label>
            <Button
              disabled={create.isPending || !name.trim() || !daysValid}
              onClick={() => create.mutate()}
            >
              Ekle
            </Button>
            <div className="w-full">
              <ErrorLine error={create.error} />
            </div>
          </div>
        </Disclosure>
      </div>

      <div className="p-4">
        {query.isLoading && <LoadingState />}
        <ErrorLine error={query.error} />

        {query.data &&
          (query.data.terms.length === 0 ? (
            <EmptyState label="Henüz vade tanımı yok." />
          ) : (
            <ul className="space-y-2">
              {query.data.terms.map((t) => (
                <TermRow key={t.id} term={t} onChanged={invalidate} />
              ))}
            </ul>
          ))}
      </div>
    </Panel>
  );
}

function TermRow({
  term,
  onChanged,
}: {
  term: PaymentTermRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(term.name);
  const [days, setDays] = useState(String(term.days));

  const save = useMutation({
    mutationFn: () =>
      apiPatch(`/api/admin/payment-terms/${term.id}`, {
        name,
        days: Number(days),
      }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });
  const toggle = useMutation({
    mutationFn: () =>
      apiPatch(`/api/admin/payment-terms/${term.id}`, {
        isActive: !term.isActive,
      }),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/payment-terms/${term.id}`),
    onSuccess: onChanged,
  });

  const locked = term.companyCount > 0;

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-48"
            />
            <TextInput
              type="number"
              min={0}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-24"
            />
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Kaydet
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
          </div>
        ) : (
          <div className="text-body-sm">
            <p className="flex items-center gap-2 font-medium">
              {term.name}
              {!term.isActive && <Badge tone="neutral">Pasif</Badge>}
            </p>
            <p className="text-ink-faint">
              {term.days === 0 ? "Peşin" : `${term.days} gün`} ·{" "}
              {term.companyCount} firmaya tanımlı
            </p>
          </div>
        )}

        {!editing && (
          <div className="flex gap-1">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Düzenle
            </Button>
            <Button
              variant="secondary"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {term.isActive ? "Pasife al" : "Aktifleştir"}
            </Button>
            <Button
              variant="dangerQuiet"
              disabled={locked || remove.isPending}
              title={
                locked
                  ? "Firmalara tanımlı vade silinemez — pasife alın"
                  : undefined
              }
              onClick={() => {
                if (confirm(`"${term.name}" vade tanımı silinsin mi?`))
                  remove.mutate();
              }}
            >
              Sil
            </Button>
          </div>
        )}
      </div>
      <ErrorLine error={save.error ?? toggle.error ?? remove.error} />
    </li>
  );
}
