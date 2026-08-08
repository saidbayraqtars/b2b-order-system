"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReportRunResult } from "@repo/services";
import {
  AGGREGATE_LABELS,
  CHART_TYPE_LABELS,
  FILTER_OPERATOR_LABELS,
  PAYMENT_METHOD_LABELS,
  REPORT_DATASET_LABELS,
  type Aggregate,
  type ChartType,
  type ColumnFormat,
  type FilterOperator,
  type ReportColumn,
  type ReportConfig,
  type ReportDataset,
  type ReportFilter,
} from "@repo/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { ReportPreview } from "@/components/report-preview";
import type { CatalogDataset, CatalogField } from "./types";

// The report designer. Everything it offers comes from the server's dataset
// catalogue, so the UI can only ever build a definition the engine accepts.

const ENUM_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay bekliyor",
  PENDING_CREDIT: "Kredi onayı bekliyor",
  CONFIRMED: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal",
  REJECTED: "Reddedildi",
  // Settlement methods come from the enum's own map: spelled out here, they
  // stopped at two and left the rest showing as raw enum names in filters.
  ...PAYMENT_METHOD_LABELS,
  DEBIT: "Borç",
  CREDIT: "Alacak",
  // Ziyaret kaydını hangi uygulama yazdı — sahada telefonla mı, masada
  // tarayıcıyla mı. Ziyaret raporunun ayırt edici sütunu.
  MOBILE: "Mobil (saha)",
  WEB: "Web",
};

const FORMATS: ColumnFormat[] = [
  "text",
  "number",
  "money",
  "percent",
  "date",
  "datetime",
];
const FORMAT_LABELS: Record<ColumnFormat, string> = {
  text: "Metin",
  number: "Sayı",
  money: "Para",
  percent: "Yüzde",
  date: "Tarih",
  datetime: "Tarih + saat",
};

const EMPTY_CONFIG: ReportConfig = {
  columns: [],
  filters: [],
  groupBy: [],
  sort: [],
  chart: { type: "table" },
};

export interface SavedDefinition {
  id: string;
  name: string;
  description: string | null;
  dataset: ReportDataset;
  isShared: boolean;
  canEdit: boolean;
  ownerName: string;
  config: ReportConfig;
}

export function ReportBuilder({ saved }: { saved?: SavedDefinition }) {
  const router = useRouter();

  const catalog = useQuery({
    queryKey: ["report-datasets"],
    queryFn: () =>
      apiGet<{ datasets: CatalogDataset[] }>("/api/reports/datasets"),
  });

  const [name, setName] = useState(saved?.name ?? "");
  const [description, setDescription] = useState(saved?.description ?? "");
  const [isShared, setIsShared] = useState(saved?.isShared ?? false);
  const [dataset, setDataset] = useState<ReportDataset>(
    saved?.dataset ?? "ORDERS",
  );
  const [config, setConfig] = useState<ReportConfig>(
    saved?.config ?? EMPTY_CONFIG,
  );
  const [result, setResult] = useState<ReportRunResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const readOnly = saved ? !saved.canEdit : false;

  const ds = catalog.data?.datasets.find((d) => d.key === dataset);
  const fieldMap = useMemo(() => {
    const m = new Map<string, CatalogField>();
    for (const f of ds?.fields ?? []) m.set(f.key, f);
    return m;
  }, [ds]);

  /**
   * Palette grouped by source table, dataset's own fields first. That grouping
   * is the whole "join" experience: the relations are declared server-side, and
   * the user only chooses which side of them to read.
   */
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, CatalogField[]>();
    for (const f of ds?.fields ?? []) {
      const list = groups.get(f.source);
      if (list) list.push(f);
      else groups.set(f.source, [f]);
    }
    const own = ds?.label;
    return [...groups.entries()].sort(([a], [b]) =>
      a === own ? -1 : b === own ? 1 : a.localeCompare(b, "tr"),
    );
  }, [ds]);

  const preview = useMutation({
    mutationFn: (body: { dataset: ReportDataset; config: ReportConfig }) =>
      apiPost<ReportRunResult>("/api/reports/run", body),
    onSuccess: (data) => {
      setResult(data);
      setPreviewError(null);
    },
    onError: (e) => setPreviewError((e as Error).message),
  });

  // Live preview, debounced — the builder is only useful if you can see what
  // each change does.
  useEffect(() => {
    if (config.columns.length === 0) {
      setResult(null);
      setPreviewError(null);
      return;
    }
    const t = setTimeout(() => preview.mutate({ dataset, config }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, JSON.stringify(config)]);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        description: description || undefined,
        isShared,
        config,
      };
      if (saved) {
        await apiPatch(`/api/reports/definitions/${saved.id}`, body);
        return saved.id;
      }
      const created = await apiPost<{ id: string }>(
        "/api/reports/definitions",
        {
          ...body,
          dataset,
        },
      );
      return created.id;
    },
    onSuccess: (id) => router.push(`/reports/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/reports/definitions/${saved!.id}`),
    onSuccess: () => router.push("/reports"),
  });

  const patch = (next: Partial<ReportConfig>) =>
    setConfig((c) => ({ ...c, ...next }));

  // ── column helpers ──
  const addColumn = (field: string) => {
    const f = fieldMap.get(field);
    if (!f) return;
    patch({
      columns: [...config.columns, { field, format: f.format }],
    });
  };
  const updateColumn = (i: number, next: Partial<ReportColumn>) =>
    patch({
      columns: config.columns.map((c, idx) =>
        idx === i ? { ...c, ...next } : c,
      ),
    });
  const removeColumn = (i: number) => {
    const removed = config.columns[i]!;
    const key = removed.aggregate
      ? `${removed.field}__${removed.aggregate.toLowerCase()}`
      : removed.field;
    patch({
      columns: config.columns.filter((_, idx) => idx !== i),
      // Sorting and charting can only point at columns that still exist.
      sort: config.sort.filter((s) => s.field !== key),
      chart:
        config.chart &&
        (config.chart.categoryField === key || config.chart.valueField === key)
          ? { type: "table" }
          : config.chart,
    });
  };
  const moveColumn = (i: number, delta: number) => {
    const next = [...config.columns];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    patch({ columns: next });
  };

  const outputColumns = result?.columns ?? [];

  if (catalog.isLoading) {
    return <p className="text-sm text-neutral-500">Yükleniyor…</p>;
  }
  if (catalog.isError) {
    return (
      <p className="text-sm text-red-600">{(catalog.error as Error).message}</p>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              Rapor adı
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              placeholder="Örn. Aylık ciro"
              className="h-9 w-56 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              Açıklama
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnly}
              className="h-9 w-72 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              Veri kümesi
            </span>
            {saved ? (
              <p className="flex h-9 items-center text-sm">
                {REPORT_DATASET_LABELS[dataset]}
              </p>
            ) : (
              <select
                value={dataset}
                onChange={(e) => {
                  // Fields belong to a dataset, so switching resets the design.
                  setDataset(e.target.value as ReportDataset);
                  setConfig(EMPTY_CONFIG);
                  setResult(null);
                }}
                className="h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                {catalog.data!.datasets.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isShared}
              disabled={readOnly}
              onChange={(e) => setIsShared(e.target.checked)}
            />
            Paylaş
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/reports"
            className="h-9 rounded-md border border-neutral-300 px-3 text-sm leading-9 dark:border-neutral-700"
          >
            Raporlar
          </Link>
          {saved && saved.canEdit && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`"${saved.name}" raporu silinsin mi?`))
                  remove.mutate();
              }}
              className="h-9 rounded-md bg-red-600 px-3 text-sm font-medium text-white"
            >
              Sil
            </button>
          )}
          <button
            type="button"
            disabled={
              readOnly ||
              !name.trim() ||
              config.columns.length === 0 ||
              save.isPending
            }
            onClick={() => save.mutate()}
            className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saved ? "Kaydet" : "Oluştur"}
          </button>
        </div>
      </header>

      {save.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {(save.error as Error).message}
        </p>
      )}
      {readOnly && (
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
          Bu rapor {saved!.ownerName} tarafından paylaşıldı — salt okunur.
          Sonuçlar sizin yetkinize göre filtrelenir.
        </p>
      )}

      {/*
        Üç sütun: alan paleti · tasarım · önizleme.
        Önizleme daha önce tasarım sütununun **en altındaydı**; sütun/filtre
        listesi uzayınca ekranın dışına kayıyor ve "önizleme yok" gibi
        görünüyordu. Artık geniş ekranda kendi sütununda ve yapışkan — her
        değişiklikten sonra sonucu görmek için kaydırmak gerekmiyor.
      */}
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_minmax(380px,0.95fr)]">
        {/* ── field palette ── */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
          <header className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Alanlar</h2>
          </header>
          <ul className="max-h-[28rem] divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
            {fieldGroups.map(([source, fields]) => (
              <li key={source}>
                <p className="sticky top-0 bg-neutral-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                  {source}
                </p>
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {fields.map((f) => (
                    <li
                      key={f.key}
                      className="flex items-center justify-between px-3 py-1.5"
                    >
                      <span className="text-sm">{f.label}</span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => addColumn(f.key)}
                          title="Sütun olarak ekle"
                          className="rounded border border-neutral-300 px-1.5 text-xs disabled:opacity-40 dark:border-neutral-700"
                        >
                          sütun
                        </button>
                        {f.groupable && (
                          <button
                            type="button"
                            disabled={
                              readOnly || config.groupBy.includes(f.key)
                            }
                            onClick={() =>
                              patch({ groupBy: [...config.groupBy, f.key] })
                            }
                            title="Bu alana göre grupla"
                            className="rounded border border-neutral-300 px-1.5 text-xs disabled:opacity-40 dark:border-neutral-700"
                          >
                            grupla
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() =>
                            patch({
                              filters: [...config.filters, defaultFilter(f)],
                            })
                          }
                          title="Filtre ekle"
                          className="rounded border border-neutral-300 px-1.5 text-xs disabled:opacity-40 dark:border-neutral-700"
                        >
                          filtre
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        {/* ── design ── */}
        <div className="space-y-4">
          {config.groupBy.length > 0 && (
            <Panel title="Gruplama">
              <div className="flex flex-wrap gap-2">
                {config.groupBy.map((g) => (
                  <span
                    key={g}
                    className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
                  >
                    {fieldMap.get(g)?.label ?? g}
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() =>
                        patch({
                          groupBy: config.groupBy.filter((x) => x !== g),
                        })
                      }
                      className="text-indigo-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Gruplarken her sütun ya gruplama alanı olmalı ya da bir özet
                fonksiyonu almalı.
              </p>
            </Panel>
          )}

          <Panel title={`Sütunlar (${config.columns.length})`}>
            {config.columns.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Soldaki listeden sütun ekleyin.
              </p>
            ) : (
              <ul className="space-y-2">
                {config.columns.map((c, i) => {
                  const f = fieldMap.get(c.field);
                  return (
                    <li
                      key={`${c.field}-${i}`}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 p-2 dark:border-neutral-800"
                    >
                      <span className="min-w-32 text-sm font-medium">
                        {f?.label ?? c.field}
                      </span>
                      <select
                        value={c.aggregate ?? ""}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateColumn(i, {
                            aggregate: (e.target.value || undefined) as
                              Aggregate | undefined,
                          })
                        }
                        className="h-8 rounded-md border border-neutral-300 px-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        <option value="">Özet yok</option>
                        {(f?.aggregates ?? []).map((a) => (
                          <option key={a} value={a}>
                            {AGGREGATE_LABELS[a]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={c.format ?? f?.format ?? "text"}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateColumn(i, {
                            format: e.target.value as ColumnFormat,
                          })
                        }
                        className="h-8 rounded-md border border-neutral-300 px-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        {FORMATS.map((fmt) => (
                          <option key={fmt} value={fmt}>
                            {FORMAT_LABELS[fmt]}
                          </option>
                        ))}
                      </select>
                      <input
                        value={c.label ?? ""}
                        disabled={readOnly}
                        placeholder="Başlık (ops.)"
                        onChange={(e) =>
                          updateColumn(i, {
                            label: e.target.value || undefined,
                          })
                        }
                        className="h-8 w-36 rounded-md border border-neutral-300 px-2 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                      />
                      <input
                        type="number"
                        value={c.width ?? ""}
                        disabled={readOnly}
                        placeholder="px"
                        min={60}
                        max={600}
                        onChange={(e) =>
                          updateColumn(i, {
                            width: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        className="h-8 w-20 rounded-md border border-neutral-300 px-2 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                      />
                      <label className="flex items-center gap-1 text-xs text-neutral-500">
                        <input
                          type="checkbox"
                          checked={Boolean(c.hidden)}
                          disabled={readOnly}
                          onChange={(e) =>
                            updateColumn(i, {
                              hidden: e.target.checked || undefined,
                            })
                          }
                        />
                        gizle
                      </label>
                      <span className="ml-auto flex gap-1">
                        <IconBtn
                          label="↑"
                          disabled={readOnly || i === 0}
                          onClick={() => moveColumn(i, -1)}
                        />
                        <IconBtn
                          label="↓"
                          disabled={readOnly || i === config.columns.length - 1}
                          onClick={() => moveColumn(i, 1)}
                        />
                        <IconBtn
                          label="×"
                          disabled={readOnly}
                          onClick={() => removeColumn(i)}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {config.filters.length > 0 && (
            <Panel title="Filtreler">
              <ul className="space-y-2">
                {config.filters.map((f, i) => (
                  <FilterRow
                    key={i}
                    filter={f}
                    field={fieldMap.get(f.field)}
                    readOnly={readOnly}
                    onChange={(next) =>
                      patch({
                        filters: config.filters.map((x, idx) =>
                          idx === i ? next : x,
                        ),
                      })
                    }
                    onRemove={() =>
                      patch({
                        filters: config.filters.filter((_, idx) => idx !== i),
                      })
                    }
                  />
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Sıralama, limit ve grafik">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Sırala
                </span>
                <select
                  value={config.sort[0]?.field ?? ""}
                  disabled={readOnly}
                  onChange={(e) =>
                    patch({
                      sort: e.target.value
                        ? [
                            {
                              field: e.target.value,
                              direction: config.sort[0]?.direction ?? "desc",
                            },
                          ]
                        : [],
                    })
                  }
                  className="h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="">Varsayılan</option>
                  {outputColumns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Yön</span>
                <select
                  value={config.sort[0]?.direction ?? "desc"}
                  disabled={readOnly || config.sort.length === 0}
                  onChange={(e) =>
                    patch({
                      sort: config.sort.length
                        ? [
                            {
                              field: config.sort[0]!.field,
                              direction: e.target.value as "asc" | "desc",
                            },
                          ]
                        : [],
                    })
                  }
                  className="h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="desc">Azalan</option>
                  <option value="asc">Artan</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Satır limiti
                </span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={config.limit ?? ""}
                  disabled={readOnly}
                  placeholder="500"
                  onChange={(e) =>
                    patch({
                      limit: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  className="h-9 w-24 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Görünüm
                </span>
                <select
                  value={config.chart?.type ?? "table"}
                  disabled={readOnly}
                  onChange={(e) =>
                    patch({
                      chart: {
                        type: e.target.value as ChartType,
                        categoryField: config.chart?.categoryField,
                        valueField: config.chart?.valueField,
                      },
                    })
                  }
                  className="h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((t) => (
                    <option key={t} value={t}>
                      {CHART_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              {config.chart && config.chart.type !== "table" && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">
                      Etiket sütunu
                    </span>
                    <select
                      value={config.chart.categoryField ?? ""}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          chart: {
                            ...config.chart!,
                            categoryField: e.target.value,
                          },
                        })
                      }
                      className="h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <option value="">Seçin</option>
                      {outputColumns.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">
                      Değer sütunu
                    </span>
                    <select
                      value={config.chart.valueField ?? ""}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          chart: {
                            ...config.chart!,
                            valueField: e.target.value,
                          },
                        })
                      }
                      className="h-9 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <option value="">Seçin</option>
                      {outputColumns
                        .filter(
                          (c) => c.format === "money" || c.format === "number",
                        )
                        .map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </Panel>

        </div>

        {/* ── live preview ── */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <Panel
            title="Önizleme"
            action={
              <button
                type="button"
                onClick={() => preview.mutate({ dataset, config })}
                disabled={config.columns.length === 0 || preview.isPending}
                className="h-7 rounded-md border border-neutral-300 px-2 text-xs disabled:opacity-40 dark:border-neutral-700"
              >
                {preview.isPending ? "Çalışıyor…" : "Yenile"}
              </button>
            }
          >
            {previewError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {previewError}
              </p>
            ) : preview.isPending && !result ? (
              <p className="text-sm text-neutral-500">Çalıştırılıyor…</p>
            ) : result ? (
              <div className="max-h-[70vh] overflow-y-auto">
                <ReportPreview result={result} title={name || "rapor"} />
              </div>
            ) : (
              <p className="text-sm text-neutral-500">
                Soldaki alan listesinden <strong>sütun</strong> ekleyin —
                sonuç anında burada görünür.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────

function defaultFilter(f: CatalogField): ReportFilter {
  const operator = (f.operators[0] ?? "eq") as FilterOperator;
  if (f.type === "date")
    return { field: f.key, operator: "lastNDays", value: 30 };
  if (operator === "in") return { field: f.key, operator, value: [] };
  if (operator === "between")
    return { field: f.key, operator, value: ["", ""] };
  return { field: f.key, operator, value: "" };
}

function FilterRow({
  filter,
  field,
  readOnly,
  onChange,
  onRemove,
}: {
  filter: ReportFilter;
  field?: CatalogField;
  readOnly: boolean;
  onChange: (next: ReportFilter) => void;
  onRemove: () => void;
}) {
  if (!field) return null;
  const needsValue =
    filter.operator !== "isNull" && filter.operator !== "notNull";

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
      <span className="min-w-32 text-sm font-medium">{field.label}</span>
      <select
        value={filter.operator}
        disabled={readOnly}
        onChange={(e) => {
          const operator = e.target.value as FilterOperator;
          const value =
            operator === "in" || operator === "notIn"
              ? []
              : operator === "between"
                ? ["", ""]
                : operator === "lastNDays"
                  ? 30
                  : "";
          onChange({ ...filter, operator, value });
        }}
        className="h-8 rounded-md border border-neutral-300 px-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
      >
        {field.operators.map((op) => (
          <option key={op} value={op}>
            {FILTER_OPERATOR_LABELS[op as FilterOperator] ?? op}
          </option>
        ))}
      </select>

      {needsValue && (
        <FilterValue
          filter={filter}
          field={field}
          readOnly={readOnly}
          onChange={onChange}
        />
      )}

      <span className="ml-auto">
        <IconBtn label="×" disabled={readOnly} onClick={onRemove} />
      </span>
    </li>
  );
}

function FilterValue({
  filter,
  field,
  readOnly,
  onChange,
}: {
  filter: ReportFilter;
  field: CatalogField;
  readOnly: boolean;
  onChange: (next: ReportFilter) => void;
}) {
  const cls =
    "h-8 rounded-md border border-neutral-300 px-2 text-xs dark:border-neutral-700 dark:bg-neutral-900";

  if (filter.operator === "in" || filter.operator === "notIn") {
    const selected = Array.isArray(filter.value)
      ? (filter.value as string[])
      : [];
    if (field.enumValues) {
      return (
        <span className="flex flex-wrap gap-2">
          {field.enumValues.map((v) => (
            <label key={v} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={selected.includes(v)}
                onChange={(e) =>
                  onChange({
                    ...filter,
                    value: e.target.checked
                      ? [...selected, v]
                      : selected.filter((x) => x !== v),
                  })
                }
              />
              {ENUM_LABELS[v] ?? v}
            </label>
          ))}
        </span>
      );
    }
    return (
      <input
        value={selected.join(", ")}
        disabled={readOnly}
        placeholder="virgülle ayırın"
        onChange={(e) =>
          onChange({
            ...filter,
            value: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        className={`${cls} w-56`}
      />
    );
  }

  if (filter.operator === "between") {
    const pair = Array.isArray(filter.value)
      ? (filter.value as string[])
      : ["", ""];
    const type = field.type === "date" ? "date" : "number";
    return (
      <span className="flex items-center gap-1">
        {[0, 1].map((idx) => (
          <input
            key={idx}
            type={type}
            value={pair[idx] ?? ""}
            disabled={readOnly}
            onChange={(e) => {
              const next = [...pair];
              next[idx] = e.target.value;
              onChange({ ...filter, value: next });
            }}
            className={`${cls} w-36`}
          />
        ))}
      </span>
    );
  }

  if (filter.operator === "lastNDays") {
    return (
      <span className="flex items-center gap-1 text-xs">
        <input
          type="number"
          min={1}
          max={3650}
          value={Number(filter.value ?? 30)}
          disabled={readOnly}
          onChange={(e) =>
            onChange({ ...filter, value: Number(e.target.value) })
          }
          className={`${cls} w-20`}
        />
        gün
      </span>
    );
  }

  if (field.enumValues) {
    return (
      <select
        value={String(filter.value ?? "")}
        disabled={readOnly}
        onChange={(e) => onChange({ ...filter, value: e.target.value })}
        className={cls}
      >
        <option value="">Seçin</option>
        {field.enumValues.map((v) => (
          <option key={v} value={v}>
            {ENUM_LABELS[v] ?? v}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "boolean") {
    return (
      <select
        value={String(filter.value ?? "true")}
        disabled={readOnly}
        onChange={(e) =>
          onChange({ ...filter, value: e.target.value === "true" })
        }
        className={cls}
      >
        <option value="true">Evet</option>
        <option value="false">Hayır</option>
      </select>
    );
  }

  return (
    <input
      type={
        field.type === "date"
          ? "date"
          : field.type === "number" || field.type === "money"
            ? "number"
            : "text"
      }
      value={String(filter.value ?? "")}
      disabled={readOnly}
      onChange={(e) => onChange({ ...filter, value: e.target.value })}
      className={`${cls} w-44`}
    />
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  /** Başlığın sağına düşen düğme (önizlemeyi elle yenilemek gibi). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-7 w-7 rounded border border-neutral-300 text-sm disabled:opacity-30 dark:border-neutral-700"
    >
      {label}
    </button>
  );
}
