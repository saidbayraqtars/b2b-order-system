"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerGroupRow } from "@repo/services";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { EmptyState, LoadingState } from "@/components/ui";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";

// Customer groups drive the group-specific price tiers, so a group that any
// company or price row still points at is never deletable.

export function GroupsManager() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const query = useQuery({
    queryKey: ["admin-customer-groups"],
    queryFn: () =>
      apiGet<{ groups: CustomerGroupRow[] }>("/api/admin/customer-groups"),
  });
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["admin-customer-groups"] });

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/customer-groups", {
        name,
        description: description || undefined,
      }),
    onSuccess: () => {
      setName("");
      setDescription("");
      invalidate();
    },
  });

  const rows = query.data?.groups ?? [];

  return (
    <Panel title={`Gruplar (${rows.length})`} bodyClassName="p-0">
      {/* Ekleme şeridi gömük zeminde, listenin üstünde — belge serileri ve vade
          ekranlarıyla aynı yer. */}
      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-sunken p-4">
        <div>
          <Label htmlFor="new-group">Grup adı</Label>
          <TextInput
            id="new-group"
            value={name}
            placeholder="Bayi, Toptancı…"
            onChange={(e) => setName(e.target.value)}
            className="w-48"
          />
        </div>
        <div>
          <Label htmlFor="new-group-desc">Açıklama</Label>
          <TextInput
            id="new-group-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-72"
          />
        </div>
        <Button
          loading={create.isPending}
          disabled={!name.trim()}
          onClick={() => create.mutate()}
        >
          Ekle
        </Button>
        <div className="w-full">
          <ErrorLine error={create.error} />
        </div>
      </div>

      <div className="p-4">
        {query.isLoading && <LoadingState />}
        <ErrorLine error={query.error} />

        {query.data &&
          (rows.length === 0 ? (
            <EmptyState label="Henüz grup yok — fiyat gruba verilir, grubu olmayan firma liste fiyatını görür." />
          ) : (
            /* Tablo değil liste: kurulum başına birkaç grup var ve satırın
               kendisi düzenleniyor. Üç satırlık bir tabloya form kutusu koymak,
               sütun hizasını satır içindeki kontrole feda ederdi. */
            <ul className="space-y-2">
              {rows.map((g) => (
                <GroupRow key={g.id} group={g} onChanged={invalidate} />
              ))}
            </ul>
          ))}
      </div>
    </Panel>
  );
}

function GroupRow({
  group,
  onChanged,
}: {
  group: CustomerGroupRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");

  const save = useMutation({
    mutationFn: () =>
      apiPatch(`/api/admin/customer-groups/${group.id}`, {
        name,
        description: description || null,
      }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/customer-groups/${group.id}`),
    onSuccess: onChanged,
  });

  const locked = group.companyCount > 0 || group.priceCount > 0;

  return (
    <li className="rounded border border-line p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <TextInput
              size="sm"
              value={name}
              aria-label="Grup adı"
              onChange={(e) => setName(e.target.value)}
              className="w-48"
            />
            <TextInput
              size="sm"
              value={description}
              aria-label="Açıklama"
              onChange={(e) => setDescription(e.target.value)}
              className="w-72"
            />
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              Kaydet
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing(false)}
            >
              Vazgeç
            </Button>
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-ink">{group.name}</p>
              <p className="mt-1 text-xs text-ink-faint">
                {group.description ?? "—"} · {group.companyCount} firma ·{" "}
                {group.priceCount} fiyat kademesi
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing(true)}
              >
                Düzenle
              </Button>
              <Button
                size="sm"
                variant="dangerQuiet"
                disabled={locked}
                loading={remove.isPending}
                title={
                  locked
                    ? "Firması veya fiyat kademesi olan grup silinemez"
                    : undefined
                }
                onClick={() => {
                  if (confirm(`"${group.name}" grubu silinsin mi?`))
                    remove.mutate();
                }}
              >
                Sil
              </Button>
            </div>
          </>
        )}
      </div>
      <ErrorLine error={save.error ?? remove.error} />
    </li>
  );
}
