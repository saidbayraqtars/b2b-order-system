"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCategoryRow } from "@repo/services";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";

interface TreeNode extends AdminCategoryRow {
  depth: number;
}

/** Flatten the parent/child rows into a depth-ordered list for rendering. */
function toTree(rows: AdminCategoryRow[]): TreeNode[] {
  const byParent = new Map<string | null, AdminCategoryRow[]>();
  for (const r of rows) {
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }

  const out: TreeNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const row of byParent.get(parentId) ?? []) {
      out.push({ ...row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);

  // Any row whose parent is missing from the list would be dropped by the walk;
  // append it at root level so it stays editable.
  if (out.length < rows.length) {
    const seen = new Set(out.map((r) => r.id));
    for (const r of rows) if (!seen.has(r.id)) out.push({ ...r, depth: 0 });
  }
  return out;
}

export function CategoriesManager() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const query = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () =>
      apiGet<{ categories: AdminCategoryRow[] }>("/api/admin/categories"),
  });

  const rows = useMemo(() => toTree(query.data?.categories ?? []), [query.data]);
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["admin", "categories"] });

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/categories", {
        name: name.trim(),
        parentId: parentId || null,
      }),
    onSuccess: () => {
      setName("");
      setParentId("");
      invalidate();
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      apiPatch(`/api/admin/categories/${id}`, { name: value }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });

  const move = useMutation({
    mutationFn: ({ id, newParentId }: { id: string; newParentId: string | null }) =>
      apiPatch(`/api/admin/categories/${id}`, { parentId: newParentId }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/categories/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <Panel title="Yeni kategori">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Kategori adı</Label>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Ambalaj"
              className="w-56"
            />
          </div>
          <div>
            <Label>Üst kategori</Label>
            <Select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-56"
            >
              <option value="">(kök)</option>
              {rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {"— ".repeat(c.depth)}
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Ekle
          </Button>
        </div>
        <ErrorLine error={create.error} />
      </Panel>

      <Panel title={`Kategoriler (${rows.length})`}>
        {query.isLoading && <p className="text-sm text-neutral-500">Yükleniyor…</p>}
        {rows.length === 0 && query.isSuccess && (
          <p className="text-sm text-neutral-500">Henüz kategori yok.</p>
        )}

        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
              <span style={{ paddingLeft: c.depth * 16 }} className="text-sm">
                {editing === c.id ? (
                  <TextInput
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editName.trim()) {
                        rename.mutate({ id: c.id, value: editName.trim() });
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="w-48"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(c.id);
                      setEditName(c.name);
                    }}
                    className="font-medium hover:underline"
                    title="Yeniden adlandır"
                  >
                    {c.name}
                  </button>
                )}
              </span>

              <span className="text-xs text-neutral-400">/{c.slug}</span>
              <span className="text-xs text-neutral-500">
                {c.productCount} ürün · {c.childCount} alt kategori
              </span>

              <div className="ml-auto flex items-center gap-2">
                <Select
                  value={c.parentId ?? ""}
                  onChange={(e) =>
                    move.mutate({ id: c.id, newParentId: e.target.value || null })
                  }
                  className="w-44"
                  title="Üst kategoriyi değiştir"
                >
                  <option value="">(kök)</option>
                  {rows
                    .filter((o) => o.id !== c.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {"— ".repeat(o.depth)}
                        {o.name}
                      </option>
                    ))}
                </Select>
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`"${c.name}" kategorisi silinsin mi?`))
                      remove.mutate(c.id);
                  }}
                >
                  Sil
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <ErrorLine error={rename.error} />
        <ErrorLine error={move.error} />
        <ErrorLine error={remove.error} />
      </Panel>
    </div>
  );
}
