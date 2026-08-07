"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_LABEL_TEMPLATES,
  LABEL_BLOCK_LABELS,
  LABEL_FIELDS,
  LABEL_TEMPLATE_KIND_LABELS,
  LabelTemplateKindEnum,
  labelBlockKindEnum,
  type LabelBlock,
  type LabelBlockKind,
  type LabelTemplateKind,
} from "@repo/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { Badge, Card, LoadingState } from "@/components/ui";

// Etiket / fiş tasarımcısı.
//
// Tasarım satır listesi olduğu için düzenleyici de bir liste: satır ekle, yukarı
// aşağı taşı, hizala, büyüt. Sürükle-bırak tuval yok — 80 mm'lik termal yazıcı
// satır satır basıyor ve mutlak konum her yazıcıda başka yere düşüyor.
//
// Önizleme aynı satırları ekranda kâğıt genişliğinde çiziyor; basım sayfası da
// aynı kuralları uyguluyor, böylece "ekranda güzel, kâğıtta bozuk" durumu
// oluşmuyor.

interface TemplateRow {
  id: string;
  kind: LabelTemplateKind;
  name: string;
  widthMm: number;
  heightMm: number | null;
  blocks: LabelBlock[];
  isDefault: boolean;
  isActive: boolean;
}

const KINDS = LabelTemplateKindEnum.options;
const BLOCK_KINDS = labelBlockKindEnum.options;

function emptyBlock(kind: LabelBlockKind): LabelBlock {
  return { kind, value: "", align: "left", scale: 1, bold: false };
}

export function LabelDesigner() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<LabelTemplateKind>("CARGO_LABEL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["label-templates", kind],
    queryFn: () =>
      apiGet<{ templates: TemplateRow[] }>(`/api/label-templates?kind=${kind}`),
  });

  // Tür değişince ya da liste tazelenince seçili tasarımı yeniden yükle.
  useEffect(() => {
    const rows = list.data?.templates ?? [];
    const found = rows.find((t) => t.id === selectedId) ?? rows[0] ?? null;
    setSelectedId(found?.id ?? null);
    setDraft(found ? { ...found, blocks: [...found.blocks] } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, kind]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const body = {
        name: draft.name,
        widthMm: draft.widthMm,
        heightMm: draft.heightMm,
        blocks: draft.blocks,
        isDefault: draft.isDefault,
        isActive: draft.isActive,
      };
      if (draft.id) {
        await apiPatch(`/api/label-templates/${draft.id}`, body);
      } else {
        await apiPost("/api/label-templates", { ...body, kind: draft.kind });
      }
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["label-templates"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/label-templates/${id}`),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["label-templates"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  /** Hazır tasarımdan başla — sıfırdan satır dizmek kimsenin işine yaramıyor. */
  function startFromDefault() {
    const base = DEFAULT_LABEL_TEMPLATES.find((t) => t.kind === kind);
    if (!base) return;
    setSelectedId(null);
    setDraft({
      id: "",
      kind,
      name: `${base.name} (kopya)`,
      widthMm: base.widthMm,
      heightMm: base.heightMm ?? null,
      blocks: base.blocks.map((b) => ({ ...b })),
      isDefault: false,
      isActive: true,
    });
  }

  function patchBlock(index: number, patch: Partial<LabelBlock>) {
    if (!draft) return;
    const blocks = draft.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b));
    setDraft({ ...draft, blocks });
  }

  function moveBlock(index: number, delta: number) {
    if (!draft) return;
    const target = index + delta;
    if (target < 0 || target >= draft.blocks.length) return;
    const blocks = [...draft.blocks];
    const [row] = blocks.splice(index, 1);
    if (row) blocks.splice(target, 0, row);
    setDraft({ ...draft, blocks });
  }

  const fields = LABEL_FIELDS[kind];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={
              k === kind
                ? "h-8 rounded-md bg-brand-600 px-3 text-xs font-medium text-white"
                : "h-8 rounded-md border border-neutral-300 px-3 text-xs dark:border-neutral-700"
            }
          >
            {LABEL_TEMPLATE_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <LoadingState />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {(list.data?.templates ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSelectedId(t.id);
                setDraft({ ...t, blocks: [...t.blocks] });
              }}
              className={
                t.id === selectedId
                  ? "h-8 rounded-md border border-brand-500 bg-brand-50 px-3 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "h-8 rounded-md border border-neutral-300 px-3 text-xs dark:border-neutral-700"
              }
            >
              {t.name}
              {t.isDefault && " ★"}
            </button>
          ))}
          <button
            type="button"
            onClick={startFromDefault}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-neutral-400 px-3 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Hazır tasarımdan yeni
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {draft && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <Card>
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-neutral-500">Ad</span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-500">
                    Genişlik (mm)
                  </span>
                  <input
                    type="number"
                    value={draft.widthMm}
                    onChange={(e) =>
                      setDraft({ ...draft, widthMm: Number(e.target.value) })
                    }
                    className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-500">
                    Yükseklik (boş = rulo)
                  </span>
                  <input
                    type="number"
                    value={draft.heightMm ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        heightMm: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="h-9 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.isDefault}
                    onChange={(e) =>
                      setDraft({ ...draft, isDefault: e.target.checked })
                    }
                  />
                  Bu türün varsayılanı
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) =>
                      setDraft({ ...draft, isActive: e.target.checked })
                    }
                  />
                  Aktif
                </label>
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  Satırlar ({draft.blocks.length})
                </h2>
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setDraft({
                      ...draft,
                      blocks: [
                        ...draft.blocks,
                        emptyBlock(e.target.value as LabelBlockKind),
                      ],
                    });
                  }}
                  className="h-8 rounded-md border border-neutral-300 px-2 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="">Satır ekle…</option>
                  {BLOCK_KINDS.map((b) => (
                    <option key={b} value={b}>
                      {LABEL_BLOCK_LABELS[b]}
                    </option>
                  ))}
                </select>
              </div>

              <ul className="space-y-2">
                {draft.blocks.map((b, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{LABEL_BLOCK_LABELS[b.kind]}</Badge>

                      {(b.kind === "text" ||
                        b.kind === "barcode" ||
                        b.kind === "qr" ||
                        b.kind === "signature") && (
                        <input
                          value={b.value ?? ""}
                          onChange={(e) => patchBlock(i, { value: e.target.value })}
                          placeholder="Metin ya da {{alan}}"
                          className="h-8 min-w-[12rem] flex-1 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                        />
                      )}

                      <select
                        value={b.align}
                        onChange={(e) =>
                          patchBlock(i, {
                            align: e.target.value as LabelBlock["align"],
                          })
                        }
                        className="h-8 rounded-md border border-neutral-300 px-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        <option value="left">sol</option>
                        <option value="center">orta</option>
                        <option value="right">sağ</option>
                      </select>

                      <select
                        value={b.scale}
                        onChange={(e) =>
                          patchBlock(i, {
                            scale: Number(e.target.value) as LabelBlock["scale"],
                          })
                        }
                        className="h-8 rounded-md border border-neutral-300 px-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={3}>3x</option>
                      </select>

                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={b.bold}
                          onChange={(e) => patchBlock(i, { bold: e.target.checked })}
                        />
                        kalın
                      </label>

                      <span className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Yukarı"
                          onClick={() => moveBlock(i, -1)}
                          className="rounded border border-neutral-300 p-1 dark:border-neutral-700"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Aşağı"
                          onClick={() => moveBlock(i, 1)}
                          className="rounded border border-neutral-300 p-1 dark:border-neutral-700"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Sil"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              blocks: draft.blocks.filter((_, j) => j !== i),
                            })
                          }
                          className="rounded border border-neutral-300 p-1 text-red-600 dark:border-neutral-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={save.isPending || draft.blocks.length === 0}
                className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {save.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
              {draft.id && (
                <button
                  type="button"
                  onClick={() => remove.mutate(draft.id)}
                  className="h-9 rounded-md px-3 text-sm text-red-600 hover:underline"
                >
                  Sil
                </button>
              )}
            </div>
          </div>

          <aside className="space-y-3">
            <Card>
              <h2 className="mb-2 text-sm font-semibold">Önizleme</h2>
              <Preview template={draft} />
            </Card>

            <Card>
              <h2 className="mb-2 text-sm font-semibold">Kullanılabilir alanlar</h2>
              <p className="mb-2 text-xs text-neutral-500">
                Metnin içine yazın; basımda dolar. Bu türde dolmayan alanlar
                listede yok.
              </p>
              <ul className="space-y-1 text-xs">
                {fields.map((f) => (
                  <li key={f.token} className="flex justify-between gap-2">
                    <code className="text-brand-700 dark:text-brand-300">
                      {f.token}
                    </code>
                    <span className="text-neutral-500">{f.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Kâğıt önizlemesi.
 *
 * Alan işaretleri **doldurulmadan** gösteriliyor: tasarımcının görmesi gereken
 * şey hangi alanın nereye geldiği, örnek bir müşterinin adı değil.
 */
function Preview({ template }: { template: TemplateRow }) {
  return (
    <div className="overflow-x-auto">
      <div
        className="bg-white p-2 text-black shadow-inner"
        style={{ width: `${template.widthMm}mm` }}
      >
        {template.blocks.map((b, i) => {
          const style = {
            textAlign: b.align,
            fontWeight: b.bold ? 700 : 400,
            fontSize: `${b.scale * 3.2}mm`,
            lineHeight: 1.25,
          } as const;

          if (b.kind === "divider")
            return <hr key={i} className="my-1 border-t border-dashed border-black" />;
          if (b.kind === "spacer")
            return <div key={i} style={{ height: `${b.scale * 4}mm` }} />;
          if (b.kind === "items")
            return (
              <p key={i} className="text-[2.8mm] italic opacity-60">
                — kalem tablosu —
              </p>
            );
          if (b.kind === "totals")
            return (
              <p key={i} className="text-right text-[2.8mm] italic opacity-60">
                — toplamlar —
              </p>
            );
          if (b.kind === "signature")
            return (
              <div key={i} className="mt-2">
                <p style={{ fontSize: "3mm" }}>{b.value || "İmza"}:</p>
                <div className="mt-5 border-t border-black" />
              </div>
            );
          if (b.kind === "barcode")
            return (
              <div key={i} className="my-1 h-6 bg-[repeating-linear-gradient(90deg,#000_0_1px,#fff_1px_3px)]" />
            );
          return (
            <p key={i} style={style}>
              {b.value || " "}
            </p>
          );
        })}
      </div>
    </div>
  );
}
