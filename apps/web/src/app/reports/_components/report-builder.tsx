"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  LinkButton,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { Badge, LoadingState } from "@/components/ui";
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

  if (catalog.isLoading) return <LoadingState />;
  if (catalog.isError) return <ErrorLine error={catalog.error} />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="report-name">Rapor adı</Label>
            <TextInput
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              placeholder="Örn. Aylık ciro"
              className="w-56"
            />
          </div>
          <div>
            <Label htmlFor="report-description">Açıklama</Label>
            <TextInput
              id="report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnly}
              className="w-72"
            />
          </div>
          <div>
            <Label htmlFor="report-dataset">Veri kümesi</Label>
            {saved ? (
              <p className="flex h-10 items-center text-sm">
                {REPORT_DATASET_LABELS[dataset]}
              </p>
            ) : (
              <Select
                id="report-dataset"
                value={dataset}
                onChange={(e) => {
                  // Fields belong to a dataset, so switching resets the design.
                  setDataset(e.target.value as ReportDataset);
                  setConfig(EMPTY_CONFIG);
                  setResult(null);
                }}
                className="w-auto"
              >
                {catalog.data!.datasets.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Checkbox
            checked={isShared}
            disabled={readOnly}
            onChange={(e) => setIsShared(e.target.checked)}
            label="Paylaş"
            className="mb-3"
          />
        </div>

        <div className="flex items-center gap-2">
          <LinkButton href="/reports" size="md">
            Raporlar
          </LinkButton>
          {saved && saved.canEdit && (
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                if (confirm(`"${saved.name}" raporu silinsin mi?`))
                  remove.mutate();
              }}
            >
              Sil
            </Button>
          )}
          <Button
            disabled={readOnly || !name.trim() || config.columns.length === 0}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {saved ? "Kaydet" : "Oluştur"}
          </Button>
        </div>
      </header>

      <ErrorLine error={save.error} />
      <ErrorLine error={remove.error} />
      {readOnly && (
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
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
        <Panel title="Alanlar" bodyClassName="p-0">
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
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={readOnly}
                          onClick={() => addColumn(f.key)}
                          title="Sütun olarak ekle"
                        >
                          sütun
                        </Button>
                        {f.groupable && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={
                              readOnly || config.groupBy.includes(f.key)
                            }
                            onClick={() =>
                              patch({ groupBy: [...config.groupBy, f.key] })
                            }
                            title="Bu alana göre grupla"
                          >
                            grupla
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={readOnly}
                          onClick={() =>
                            patch({
                              filters: [...config.filters, defaultFilter(f)],
                            })
                          }
                          title="Filtre ekle"
                        >
                          filtre
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>

        {/* ── design ── */}
        <div className="space-y-4">
          {config.groupBy.length > 0 && (
            <Panel title="Gruplama">
              <div className="flex flex-wrap gap-2">
                {/* Rozet marka renginde: burası indigo yazılmıştı ve
                    `brand` skalası da indigo olduğu için fark edilmiyordu —
                    ama marka rengi değişince bu tek yer geride kalırdı. */}
                {config.groupBy.map((g) => (
                  <Badge key={g} tone="brand">
                    {fieldMap.get(g)?.label ?? g}
                    <button
                      type="button"
                      disabled={readOnly}
                      aria-label={`${fieldMap.get(g)?.label ?? g} gruplamasını kaldır`}
                      onClick={() =>
                        patch({
                          groupBy: config.groupBy.filter((x) => x !== g),
                        })
                      }
                      className="opacity-60 hover:opacity-100 disabled:opacity-30"
                    >
                      ×
                    </button>
                  </Badge>
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
                      <Select
                        size="sm"
                        value={c.aggregate ?? ""}
                        disabled={readOnly}
                        aria-label="Özet fonksiyonu"
                        onChange={(e) =>
                          updateColumn(i, {
                            aggregate: (e.target.value || undefined) as
                              Aggregate | undefined,
                          })
                        }
                        className="w-auto"
                      >
                        <option value="">Özet yok</option>
                        {(f?.aggregates ?? []).map((a) => (
                          <option key={a} value={a}>
                            {AGGREGATE_LABELS[a]}
                          </option>
                        ))}
                      </Select>
                      <Select
                        size="sm"
                        value={c.format ?? f?.format ?? "text"}
                        disabled={readOnly}
                        aria-label="Biçim"
                        onChange={(e) =>
                          updateColumn(i, {
                            format: e.target.value as ColumnFormat,
                          })
                        }
                        className="w-auto"
                      >
                        {FORMATS.map((fmt) => (
                          <option key={fmt} value={fmt}>
                            {FORMAT_LABELS[fmt]}
                          </option>
                        ))}
                      </Select>
                      <TextInput
                        size="sm"
                        value={c.label ?? ""}
                        disabled={readOnly}
                        placeholder="Başlık (ops.)"
                        aria-label="Sütun başlığı"
                        onChange={(e) =>
                          updateColumn(i, {
                            label: e.target.value || undefined,
                          })
                        }
                        className="w-36"
                      />
                      <TextInput
                        size="sm"
                        type="number"
                        value={c.width ?? ""}
                        disabled={readOnly}
                        placeholder="px"
                        aria-label="Sütun genişliği"
                        min={60}
                        max={600}
                        onChange={(e) =>
                          updateColumn(i, {
                            width: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        className="w-20"
                      />
                      <Checkbox
                        checked={Boolean(c.hidden)}
                        disabled={readOnly}
                        onChange={(e) =>
                          updateColumn(i, {
                            hidden: e.target.checked || undefined,
                          })
                        }
                        label="gizle"
                      />
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
              <div>
                <Label htmlFor="sort-field">Sırala</Label>
                <Select
                  id="sort-field"
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
                  className="w-auto"
                >
                  <option value="">Varsayılan</option>
                  {outputColumns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="sort-direction">Yön</Label>
                <Select
                  id="sort-direction"
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
                  className="w-auto"
                >
                  <option value="desc">Azalan</option>
                  <option value="asc">Artan</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="row-limit">Satır limiti</Label>
                <TextInput
                  id="row-limit"
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
                  className="w-24"
                />
              </div>
              <div>
                <Label htmlFor="chart-type">Görünüm</Label>
                <Select
                  id="chart-type"
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
                  className="w-auto"
                >
                  {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((t) => (
                    <option key={t} value={t}>
                      {CHART_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              {config.chart && config.chart.type !== "table" && (
                <>
                  <div>
                    <Label htmlFor="chart-category">Etiket sütunu</Label>
                    <Select
                      id="chart-category"
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
                      className="w-auto"
                    >
                      <option value="">Seçin</option>
                      {outputColumns.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="chart-value">Değer sütunu</Label>
                    <Select
                      id="chart-value"
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
                      className="w-auto"
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
                    </Select>
                  </div>
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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => preview.mutate({ dataset, config })}
                disabled={config.columns.length === 0}
                loading={preview.isPending}
              >
                Yenile
              </Button>
            }
          >
            {previewError ? (
              <ErrorLine error={new Error(previewError)} />
            ) : preview.isPending && !result ? (
              <LoadingState label="Çalıştırılıyor…" />
            ) : result ? (
              <div className="max-h-[70vh] overflow-y-auto">
                <ReportPreview result={result} title={name || "rapor"} />
              </div>
            ) : (
              <p className="text-sm text-neutral-500">
                Soldaki alan listesinden <strong>sütun</strong> ekleyin — sonuç
                anında burada görünür.
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
      <Select
        size="sm"
        value={filter.operator}
        disabled={readOnly}
        aria-label={`${field.label} karşılaştırması`}
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
        className="w-auto"
      >
        {field.operators.map((op) => (
          <option key={op} value={op}>
            {FILTER_OPERATOR_LABELS[op as FilterOperator] ?? op}
          </option>
        ))}
      </Select>

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
  if (filter.operator === "in" || filter.operator === "notIn") {
    const selected = Array.isArray(filter.value)
      ? (filter.value as string[])
      : [];
    if (field.enumValues) {
      return (
        <span className="flex flex-wrap gap-3">
          {field.enumValues.map((v) => (
            <Checkbox
              key={v}
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
              label={ENUM_LABELS[v] ?? v}
            />
          ))}
        </span>
      );
    }
    return (
      <TextInput
        size="sm"
        value={selected.join(", ")}
        disabled={readOnly}
        placeholder="virgülle ayırın"
        aria-label={`${field.label} değerleri`}
        onChange={(e) =>
          onChange({
            ...filter,
            value: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        className="w-56"
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
          <TextInput
            key={idx}
            size="sm"
            type={type}
            aria-label={`${field.label} ${idx === 0 ? "alt" : "üst"} sınır`}
            value={pair[idx] ?? ""}
            disabled={readOnly}
            onChange={(e) => {
              const next = [...pair];
              next[idx] = e.target.value;
              onChange({ ...filter, value: next });
            }}
            className="w-36"
          />
        ))}
      </span>
    );
  }

  if (filter.operator === "lastNDays") {
    return (
      <span className="flex items-center gap-1 text-xs">
        <TextInput
          size="sm"
          type="number"
          min={1}
          max={3650}
          aria-label={`${field.label}: son kaç gün`}
          value={Number(filter.value ?? 30)}
          disabled={readOnly}
          onChange={(e) =>
            onChange({ ...filter, value: Number(e.target.value) })
          }
          className="w-20"
        />
        gün
      </span>
    );
  }

  if (field.enumValues) {
    return (
      <Select
        size="sm"
        value={String(filter.value ?? "")}
        disabled={readOnly}
        aria-label={field.label}
        onChange={(e) => onChange({ ...filter, value: e.target.value })}
        className="w-auto"
      >
        <option value="">Seçin</option>
        {field.enumValues.map((v) => (
          <option key={v} value={v}>
            {ENUM_LABELS[v] ?? v}
          </option>
        ))}
      </Select>
    );
  }

  if (field.type === "boolean") {
    return (
      <Select
        size="sm"
        value={String(filter.value ?? "true")}
        disabled={readOnly}
        aria-label={field.label}
        onChange={(e) =>
          onChange({ ...filter, value: e.target.value === "true" })
        }
        className="w-auto"
      >
        <option value="true">Evet</option>
        <option value="false">Hayır</option>
      </Select>
    );
  }

  return (
    <TextInput
      size="sm"
      aria-label={field.label}
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
      className="w-44"
    />
  );
}

/**
 * Kare, tek karakterlik düğme (↑ ↓ ×).
 *
 * `Button`ın kendisi değil: buradaki hedef kare bir kutu ve `Button`ın yatay
 * dolgusu onu dikdörtgen yapıyor. Görünümün geri kalanı — kenarlık, odak,
 * kapalıyken solma — ortak `secondary` düğmeden geliyor.
 */
function IconBtn({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="w-8 px-0"
    >
      {label}
    </Button>
  );
}
