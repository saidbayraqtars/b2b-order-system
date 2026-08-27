"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCategoryRow } from "@repo/services";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import {
  LoadingState,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
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

  const rows = useMemo(
    () => toTree(query.data?.categories ?? []),
    [query.data],
  );
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
    mutationFn: ({
      id,
      newParentId,
    }: {
      id: string;
      newParentId: string | null;
    }) => apiPatch(`/api/admin/categories/${id}`, { parentId: newParentId }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/categories/${id}`),
    onSuccess: invalidate,
  });

  return (
    <Panel title={`Kategoriler (${rows.length})`} bodyClassName="p-0">
      {/* Ekleme şeridi listenin üstünde ve gömük zeminde — vade, hacim ve kasa
          ekranlarıyla aynı yer. Ayrı bir panel olduğunda sayfa iki kutuya
          bölünüyordu ve ikisi de "kategori" diyordu. */}
      <div className="flex flex-wrap items-end gap-2 border-b border-line bg-sunken p-4">
        <div>
          <Label htmlFor="new-category">Kategori adı</Label>
          <TextInput
            id="new-category"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Ambalaj"
            className="w-56"
          />
        </div>
        <div>
          <Label htmlFor="new-category-parent">Üst kategori</Label>
          <Select
            id="new-category-parent"
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
        <div className="w-full">
          <ErrorLine error={create.error} />
        </div>
      </div>

      {query.isLoading && (
        <div className="px-4">
          <LoadingState />
        </div>
      )}

      <Table>
        <THead>
          <tr>
            <Th>Kategori</Th>
            <Th>Yol</Th>
            <Th align="right">Ürün</Th>
            <Th align="right">Alt</Th>
            <Th>Üst kategori</Th>
            <Th />
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && query.isSuccess && (
            <TableEmpty colSpan={6} label="Henüz kategori yok." />
          )}
          {rows.map((c) => (
            <tr key={c.id}>
              <Td>
                {/* Girinti hiyerarşiyi tek bakışta okutuyor; adres satırında
                    tutulmadığı için sütunun kendisi taşıyor. */}
                <span className="block" style={{ paddingLeft: c.depth * 16 }}>
                  {editing === c.id ? (
                    <TextInput
                      value={editName}
                      autoFocus
                      size="sm"
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
                      className="font-medium text-ink hover:underline"
                      title="Yeniden adlandır"
                    >
                      {c.name}
                    </button>
                  )}
                </span>
              </Td>
              <Td muted>/{c.slug}</Td>
              <Td align="right" numeric>
                {c.productCount}
              </Td>
              <Td align="right" numeric>
                {c.childCount}
              </Td>
              <Td>
                <Select
                  size="sm"
                  value={c.parentId ?? ""}
                  onChange={(e) =>
                    move.mutate({
                      id: c.id,
                      newParentId: e.target.value || null,
                    })
                  }
                  className="w-44"
                  aria-label={`${c.name} üst kategorisi`}
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
              </Td>
              <Td align="right">
                {/* Elli satırın üstünde `dangerQuiet` sağ kenarda kırmızı
                    bir sütuna dönüşüyor — stok partilerindeki ile aynı sebep. */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`"${c.name}" kategorisi silinsin mi?`))
                      remove.mutate(c.id);
                  }}
                >
                  Sil
                </Button>
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>

      <div className="px-4 pb-4">
        <ErrorLine error={rename.error ?? move.error ?? remove.error} />
      </div>
    </Panel>
  );
}
