"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BlockCatalogEntry, PageBlock, PageLayoutView } from "@repo/services";
import { PAGE_KEY_LABELS, type PageKey } from "@repo/types";
import { apiDelete, apiGet, apiPut } from "@/lib/fetcher";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { Badge, LoadingState } from "@/components/ui";

// Sayfa düzeni editörü.
//
// Sürükle-bırak yok: ↑/↓ düğmeleri klavyeyle çalışıyor, dokunmatikte
// şaşırtmıyor ve beş bloklu bir listede sürüklemekten hızlı. Sürükleme, liste
// uzadığında değerlenir.

const REGION_LABEL = {
  stack: "tam genişlik",
  row: "katalog satırı",
} as const;

export function LayoutEditor({ pageKey }: { pageKey: PageKey }) {
  const qc = useQueryClient();
  const [blocks, setBlocks] = useState<PageBlock[] | null>(null);

  const query = useQuery({
    queryKey: ["page-layout", pageKey],
    queryFn: () =>
      apiGet<{ layout: PageLayoutView; catalog: BlockCatalogEntry[] }>(
        `/api/admin/page-layout/${pageKey}`,
      ),
  });

  // Sunucudan gelen düzen forma bir kez kopyalanıyor. Doğrudan `query.data`
  // üzerinde çalışmak, arka planda tazelenen bir sorgunun kaydedilmemiş
  // değişiklikleri silmesi demekti.
  useEffect(() => {
    if (query.data && blocks === null) setBlocks(query.data.layout.blocks);
  }, [query.data, blocks]);

  const save = useMutation({
    mutationFn: () => apiPut(`/api/admin/page-layout/${pageKey}`, { blocks }),
    onSuccess: () => {
      setBlocks(null);
      void qc.invalidateQueries({ queryKey: ["page-layout", pageKey] });
    },
  });

  const reset = useMutation({
    mutationFn: () => apiDelete(`/api/admin/page-layout/${pageKey}`),
    onSuccess: () => {
      setBlocks(null);
      void qc.invalidateQueries({ queryKey: ["page-layout", pageKey] });
    },
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorLine error={query.error} />;

  const catalog = query.data!.catalog;
  const layout = query.data!.layout;
  const current = blocks ?? layout.blocks;
  const defOf = (type: string) => catalog.find((c) => c.type === type);
  const missing = catalog.filter((c) => !current.some((b) => b.type === c.type));

  const move = (i: number, delta: number) => {
    const next = [...current];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setBlocks(next);
  };

  const patchBlock = (i: number, change: Partial<PageBlock>) =>
    setBlocks(current.map((b, idx) => (idx === i ? { ...b, ...change } : b)));

  return (
    <Panel
      title={PAGE_KEY_LABELS[pageKey]}
      action={
        <div className="flex items-center gap-2">
          {layout.isDefault ? (
            <Badge tone="neutral">varsayılan</Badge>
          ) : (
            <span className="text-xs text-neutral-500">
              {layout.updatedByName ?? "bilinmiyor"} ·{" "}
              {new Date(layout.updatedAt!).toLocaleDateString("tr-TR")}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={reset.isPending}
            disabled={layout.isDefault}
            onClick={() => {
              if (confirm("Düzen varsayılana döndürülsün mü?")) reset.mutate();
            }}
          >
            Varsayılana dön
          </Button>
          <Button
            size="sm"
            loading={save.isPending}
            disabled={blocks === null}
            onClick={() => save.mutate()}
          >
            Kaydet
          </Button>
        </div>
      }
    >
      <ErrorLine error={save.error} />
      <ErrorLine error={reset.error} />

      <ul className="space-y-2">
        {current.map((block, i) => {
          const def = defOf(block.type);
          if (!def) return null;
          return (
            <li
              key={block.type}
              className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {def.label}
                    <Badge tone="neutral">{REGION_LABEL[def.region]}</Badge>
                    {def.required && <Badge tone="brand">zorunlu</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {def.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Checkbox
                    checked={block.enabled}
                    // Zorunlu blok kapatılamıyor; sunucu da reddediyor, bu
                    // yalnızca reddedilecek isteği yazmaktan kurtarıyor.
                    disabled={def.required}
                    onChange={(e) => patchBlock(i, { enabled: e.target.checked })}
                    label="açık"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-8 px-0"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    title="Yukarı"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-8 px-0"
                    disabled={i === current.length - 1}
                    onClick={() => move(i, 1)}
                    title="Aşağı"
                  >
                    ↓
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-8 px-0"
                    disabled={def.required}
                    onClick={() =>
                      setBlocks(current.filter((_, idx) => idx !== i))
                    }
                    title="Kaldır"
                  >
                    ×
                  </Button>
                </div>
              </div>

              {def.params.length > 0 && (
                <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  {def.params.map((p) => (
                    <ParamField
                      key={p.key}
                      def={p}
                      value={block.params[p.key]}
                      onChange={(value) =>
                        patchBlock(i, {
                          params: { ...block.params, [p.key]: value },
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {missing.length > 0 && (
        <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className="mb-2 text-xs text-neutral-500">Eklenebilir bloklar</p>
          <div className="flex flex-wrap gap-2">
            {missing.map((c) => (
              <Button
                key={c.type}
                variant="secondary"
                size="sm"
                onClick={() =>
                  setBlocks([
                    ...current,
                    { type: c.type, params: {}, enabled: true },
                  ])
                }
              >
                + {c.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function ParamField({
  def,
  value,
  onChange,
}: {
  def: BlockCatalogEntry["params"][number];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (def.type === "boolean") {
    return (
      <Checkbox
        checked={value !== false}
        onChange={(e) => onChange(e.target.checked)}
        label={def.label}
        hint={def.hint}
      />
    );
  }

  if (def.type === "number") {
    // Sayı alanı seçim kutusu: aralık dar (2–4) ve serbest metin kutusu, sunucu
    // zaten kırpacağı hâlde geçersiz bir sayı yazdırıyordu.
    const options = [];
    for (let n = def.min; n <= def.max; n++) options.push(n);
    return (
      <div>
        <Label hint={def.hint}>{def.label}</Label>
        <Select
          size="sm"
          value={String(Number(value) || def.min)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-auto"
        >
          {options.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  return (
    <div className="min-w-[16rem] flex-1">
      <Label hint={def.hint}>{def.label}</Label>
      <TextInput
        size="sm"
        value={String(value ?? "")}
        maxLength={def.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
