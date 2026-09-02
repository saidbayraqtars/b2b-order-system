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
  Modal,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { Disclosure, DisclosureBadge } from "@/components/disclosure";
import {
  TreeToggle,
  nestByParent,
  useCategoryTree,
} from "@/components/category-tree";
import { useToast } from "@/components/toast";

/**
 * "Taşı" penceresinin seçim listesi için düz, girintili ad listesi.
 *
 * Ağacın kendisi artık kapanır ama bu `<option>` listesi düz olmak zorunda —
 * `<select>` iç içe grup taşımıyor. Girinti tire ile veriliyor, tablodakiyle
 * aynı hiyerarşi.
 */
function optionList(
  rows: readonly AdminCategoryRow[],
): Array<{ id: string; label: string; depth: number }> {
  const byParent = new Map<string | null, AdminCategoryRow[]>();
  for (const r of rows) {
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }
  const out: Array<{ id: string; label: string; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const row of byParent.get(parentId) ?? []) {
      out.push({ id: row.id, label: row.name, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  // Üstü listede olmayan satır düşmesin — `nestByParent` ile aynı kural.
  if (out.length < rows.length) {
    const seen = new Set(out.map((r) => r.id));
    for (const r of rows)
      if (!seen.has(r.id)) out.push({ id: r.id, label: r.name, depth: 0 });
  }
  return out;
}

export function CategoriesManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  // Taşınmakta olan satır. Satır içi `<select>` yerine pencere: elli bir
  // kategoride elli bir açılır kutu ekranın gürültüsünün büyük kısmıydı ve
  // hepsi aynı anda ekranda duruyordu (`YOGUNLUK-RAPORU.md` N3).
  const [moving, setMoving] = useState<AdminCategoryRow | null>(null);

  const query = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () =>
      apiGet<{ categories: AdminCategoryRow[] }>("/api/admin/categories"),
  });

  const flat = useMemo(() => query.data?.categories ?? [], [query.data]);
  const roots = useMemo(() => nestByParent(flat), [flat]);
  const tree = useCategoryTree({ roots, storageKey: "admin-categories" });
  const options = useMemo(() => optionList(flat), [flat]);

  const { notify } = useToast();
  // Tazeleme + "oldu" tek yerde: dört mutasyonun dördü de aynı iki şeyi
  // yapıyor ve biri unutulursa ekran sessiz kalıyor — §4.4'ün sebebi tam
  // olarak buydu.
  const invalidate = (message = "Kaydedildi") => {
    void qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    notify(message);
  };

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/categories", {
        name: name.trim(),
        parentId: parentId || null,
      }),
    onSuccess: () => {
      setName("");
      setParentId("");
      invalidate("Kategori eklendi");
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      apiPatch(`/api/admin/categories/${id}`, { name: value }),
    onSuccess: () => {
      setEditing(null);
      invalidate("Adı değiştirildi");
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
    onSuccess: () => {
      setMoving(null);
      invalidate("Üst kategori değişti");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/categories/${id}`),
    onSuccess: () => invalidate("Kategori silindi"),
  });

  return (
    <Panel title={`Kategoriler (${tree.total})`} bodyClassName="p-0">
      {/* Şerit: arama + toplu aç/kapa, altında katlanmış ekleme formu.
          Arama ağaçta kaydırmanın alternatifi — elli bir satırda aranan
          kategoriye ulaşmanın yolu dalları tek tek açmak değil. */}
      <div className="space-y-2 border-b border-line bg-sunken px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            size="sm"
            value={tree.search}
            onChange={(e) => tree.setSearch(e.target.value)}
            placeholder="Kategori ara"
            aria-label="Kategori ara"
            className="w-56"
          />
          <Button variant="ghost" size="xs" onClick={tree.expandAll}>
            Tümünü aç
          </Button>
          <Button variant="ghost" size="xs" onClick={tree.collapseAll}>
            Tümünü kapat
          </Button>
          <span className="ml-auto text-xs tabular-nums text-ink-faint">
            {tree.matches != null
              ? `${tree.matches} eşleşme`
              : `${tree.total} kategori`}
          </span>
        </div>

        {canManage && (
          <Disclosure label="+ Yeni kategori" storageKey="categories:new">
            <div className="flex flex-wrap items-end gap-2 pb-1">
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
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {"— ".repeat(o.depth)}
                      {o.label}
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
          </Disclosure>
        )}
      </div>

      {query.isLoading && (
        <div className="px-4">
          <LoadingState />
        </div>
      )}

      {/* Sıralama bilerek yok: satırların sırası bir *hiyerarşi* ve girinti
          ondan okunuyor. Ada göre sıralamak ağacı düzleştirir, yani ekranın
          taşıdığı tek fazladan bilgiyi siler. */}
      <Table stickyHead dense>
        <THead>
          <tr>
            <Th>Kategori</Th>
            <Th>Yol</Th>
            <Th align="right">Ürün</Th>
            <Th align="right">Alt</Th>
            <Th />
          </tr>
        </THead>
        <TBody>
          {tree.rows.length === 0 && query.isSuccess && (
            <TableEmpty
              colSpan={5}
              label={
                tree.matches === 0
                  ? `"${tree.search}" ile eşleşen kategori yok.`
                  : canManage
                    ? "Henüz kategori yok — ürün kategorisiz açılmıyor, ağaç kurulumun ikinci adımı."
                    : "Henüz kategori yok."
              }
            />
          )}
          {tree.rows.map((row) => {
            const c = row.data;
            return (
              <tr key={c.id}>
                <Td>
                  {/* Girinti hiyerarşiyi tek bakışta okutuyor; adres satırında
                      tutulmadığı için sütunun kendisi taşıyor. */}
                  <span
                    className="flex items-center gap-1"
                    style={{ paddingLeft: row.depth * 16 }}
                  >
                    <TreeToggle
                      open={row.open}
                      hasChildren={row.hasChildren}
                      label={c.name}
                      onClick={() => tree.toggle(c.id)}
                    />
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
                    ) : canManage ? (
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
                    ) : (
                      <span className="font-medium text-ink">{c.name}</span>
                    )}
                    {/* Kapalı dalın künyesi: içinde ne olduğunu söylemeyen
                        kapalı bir başlık kaydırmaktan kötüdür. */}
                    {row.hasChildren && !row.open && (
                      <DisclosureBadge>{row.descendants} alt</DisclosureBadge>
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
                <Td align="right">
                  {/* Elli satırın üstünde `dangerQuiet` sağ kenarda kırmızı
                      bir sütuna dönüşüyor — stok partilerindeki ile aynı sebep. */}
                  {canManage && (
                    <span className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setMoving(c)}
                      >
                        Taşı
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (confirm(`"${c.name}" kategorisi silinsin mi?`))
                            remove.mutate(c.id);
                        }}
                      >
                        Sil
                      </Button>
                    </span>
                  )}
                </Td>
              </tr>
            );
          })}
        </TBody>
      </Table>

      <div className="px-4 pb-4">
        <ErrorLine error={rename.error ?? move.error ?? remove.error} />
      </div>

      {moving && (
        <MoveDialog
          category={moving}
          options={options}
          pending={move.isPending}
          onClose={() => setMoving(null)}
          onSubmit={(newParentId) =>
            move.mutate({ id: moving.id, newParentId })
          }
        />
      )}
    </Panel>
  );
}

/**
 * Tek kategoriyi başka bir üstün altına taşıyan pencere.
 *
 * Kendisi ve **altındaki** kategoriler listeden eleniyor: bir dalı kendi
 * çocuğunun altına taşımak ağacı döngüye sokar. Sunucu bunu zaten reddediyor
 * ama kullanıcıya reddedilecek bir seçenek sunmanın anlamı yok.
 */
function MoveDialog({
  category,
  options,
  pending,
  onClose,
  onSubmit,
}: {
  category: AdminCategoryRow;
  options: Array<{ id: string; label: string; depth: number }>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (newParentId: string | null) => void;
}) {
  const [value, setValue] = useState(category.parentId ?? "");

  // Kendi alt ağacı: seçim listesinden çıkarılacak kimlikler.
  const blocked = useMemo(() => {
    const index = options.findIndex((o) => o.id === category.id);
    const out = new Set<string>([category.id]);
    if (index < 0) return out;
    const depth = options[index]!.depth;
    for (let i = index + 1; i < options.length; i += 1) {
      const o = options[i]!;
      if (o.depth <= depth) break;
      out.add(o.id);
    }
    return out;
  }, [options, category.id]);

  return (
    <Modal title={`"${category.name}" taşı`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label htmlFor="move-parent">Yeni üst kategori</Label>
          <Select
            id="move-parent"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">(kök)</option>
            {options
              .filter((o) => !blocked.has(o.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {"— ".repeat(o.depth)}
                  {o.label}
                </option>
              ))}
          </Select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            disabled={pending || value === (category.parentId ?? "")}
            onClick={() => onSubmit(value || null)}
          >
            Taşı
          </Button>
        </div>
      </div>
    </Modal>
  );
}
