"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerGroupRow } from "@repo/services";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { LoadingState } from "@/components/ui";
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

  return (
    <Panel title="Müşteri grupları">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label>
          <Label>Grup adı</Label>
          <TextInput
            value={name}
            placeholder="Bayi, Toptancı…"
            onChange={(e) => setName(e.target.value)}
            className="w-48"
          />
        </label>
        <label>
          <Label>Açıklama</Label>
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-72"
          />
        </label>
        <Button
          disabled={create.isPending || !name.trim()}
          onClick={() => create.mutate()}
        >
          Ekle
        </Button>
      </div>
      <ErrorLine error={create.error} />

      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />

      {query.data && (
        <ul className="space-y-2">
          {query.data.groups.map((g) => (
            <GroupRow key={g.id} group={g} onChanged={invalidate} />
          ))}
          {query.data.groups.length === 0 && (
            <li className="text-sm text-neutral-500">Henüz grup yok.</li>
          )}
        </ul>
      )}
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
    <li className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-48"
            />
            <TextInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-72"
            />
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Kaydet
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
          </div>
        ) : (
          <div className="text-sm">
            <p className="font-medium">{group.name}</p>
            <p className="text-neutral-500">
              {group.description ?? "—"} · {group.companyCount} firma ·{" "}
              {group.priceCount} fiyat kademesi
            </p>
          </div>
        )}

        {!editing && (
          <div className="flex gap-1">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Düzenle
            </Button>
            <Button
              variant="danger"
              disabled={locked || remove.isPending}
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
        )}
      </div>
      <ErrorLine error={save.error ?? remove.error} />
    </li>
  );
}
