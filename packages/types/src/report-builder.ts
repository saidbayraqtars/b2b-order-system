import { z } from "zod";

// Shape of a user-defined report. These schemas check STRUCTURE only.
// Whether a field name exists, may be grouped, or may take a given aggregate is
// decided by the dataset registry in @repo/services — the registry is the
// security boundary, and it runs on every write and every execution.

export const ReportDatasetEnum = z.enum([
  "ORDERS",
  "ORDER_ITEMS",
  "LEDGER",
  "COMPANIES",
  "CHECKINS",
  "CASH",
  "PROMOTIONS",
  "STOCK",
]);
export type ReportDataset = z.infer<typeof ReportDatasetEnum>;

export const REPORT_DATASET_LABELS: Record<ReportDataset, string> = {
  ORDERS: "Siparişler",
  ORDER_ITEMS: "Sipariş kalemleri",
  LEDGER: "Cari defter",
  COMPANIES: "Firmalar",
  CHECKINS: "Ziyaretler",
  CASH: "Kasa defteri",
  PROMOTIONS: "Kampanya kullanımları",
  STOCK: "Stok hareketleri",
};

export const AggregateEnum = z.enum([
  "SUM",
  "COUNT",
  "COUNT_DISTINCT",
  "AVG",
  "MIN",
  "MAX",
]);
export type Aggregate = z.infer<typeof AggregateEnum>;

export const AGGREGATE_LABELS: Record<Aggregate, string> = {
  SUM: "Toplam",
  COUNT: "Adet",
  COUNT_DISTINCT: "Benzersiz adet",
  AVG: "Ortalama",
  MIN: "En küçük",
  MAX: "En büyük",
};

export const FilterOperatorEnum = z.enum([
  "eq",
  "neq",
  "contains",
  "startsWith",
  "in",
  "notIn",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "isNull",
  "notNull",
  /** Rolling window: keeps a saved report current instead of freezing its dates. */
  "lastNDays",
]);
export type FilterOperator = z.infer<typeof FilterOperatorEnum>;

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "eşittir",
  neq: "eşit değildir",
  contains: "içerir",
  startsWith: "ile başlar",
  in: "şunlardan biri",
  notIn: "şunlardan biri değil",
  gt: "büyüktür",
  gte: "büyük veya eşittir",
  lt: "küçüktür",
  lte: "küçük veya eşittir",
  between: "arasında",
  isNull: "boş",
  notNull: "dolu",
  lastNDays: "son N gün",
};

export const ColumnFormatEnum = z.enum([
  "text",
  "number",
  "money",
  "percent",
  "date",
  "datetime",
]);
export type ColumnFormat = z.infer<typeof ColumnFormatEnum>;

export const reportColumnSchema = z.object({
  field: z.string().min(1).max(120),
  /** Overrides the registry's Turkish label in the output header. */
  label: z.string().max(120).optional(),
  aggregate: AggregateEnum.optional(),
  format: ColumnFormatEnum.optional(),
  width: z.number().int().min(60).max(600).optional(),
  hidden: z.boolean().optional(),
});
export type ReportColumn = z.infer<typeof reportColumnSchema>;

/**
 * A column the report works out for itself: "kâr / ciro", "toplam / adet".
 *
 * The expression is arithmetic over the report's *own output columns* and is
 * evaluated after the query, never sent to the database. Whether it parses and
 * whether every name in it exists is decided in @repo/services — same split as
 * everything else here.
 */
export const reportComputedSchema = z.object({
  /** Output key; must not collide with a source column. */
  key: z
    .string()
    .min(1)
    .max(30)
    .regex(
      /^[A-Za-z_][A-Za-z0-9_]*$/,
      "Sütun anahtarı harfle başlamalı, harf/rakam/alt çizgi içerebilir",
    ),
  label: z.string().min(1, "Sütun başlığı gerekli").max(120),
  expression: z.string().min(1, "Formül gerekli").max(400),
  format: ColumnFormatEnum.optional(),
  width: z.number().int().min(60).max(600).optional(),
});
export type ReportComputedColumn = z.infer<typeof reportComputedSchema>;

/** `value` is validated against the field's type by the registry, not here. */
export const reportFilterSchema = z.object({
  field: z.string().min(1).max(120),
  operator: FilterOperatorEnum,
  value: z.unknown().optional(),
});
export type ReportFilter = z.infer<typeof reportFilterSchema>;

export const reportSortSchema = z.object({
  field: z.string().min(1).max(120),
  direction: z.enum(["asc", "desc"]).default("asc"),
});
export type ReportSort = z.infer<typeof reportSortSchema>;

export const ChartTypeEnum = z.enum(["table", "bar", "line", "pie"]);
export type ChartType = z.infer<typeof ChartTypeEnum>;

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  table: "Tablo",
  bar: "Sütun grafik",
  line: "Çizgi grafik",
  pie: "Pasta grafik",
};

export const reportChartSchema = z.object({
  type: ChartTypeEnum.default("table"),
  /** Which output column supplies the labels / the values. */
  categoryField: z.string().max(120).optional(),
  valueField: z.string().max(120).optional(),
});
export type ReportChart = z.infer<typeof reportChartSchema>;

export const reportConfigSchema = z.object({
  columns: z.array(reportColumnSchema).min(1, "En az bir sütun seçin").max(30),
  computed: z.array(reportComputedSchema).max(10).default([]),
  filters: z.array(reportFilterSchema).max(20).default([]),
  groupBy: z.array(z.string().min(1).max(120)).max(5).default([]),
  sort: z.array(reportSortSchema).max(5).default([]),
  limit: z.number().int().min(1).max(5000).optional(),
  chart: reportChartSchema.optional(),
});
export type ReportConfig = z.infer<typeof reportConfigSchema>;

export const createReportDefinitionSchema = z.object({
  name: z.string().min(1, "Rapor adı gerekli").max(120),
  description: z.string().max(500).optional(),
  dataset: ReportDatasetEnum,
  isShared: z.boolean().optional(),
  config: reportConfigSchema,
});
export type CreateReportDefinitionInput = z.infer<
  typeof createReportDefinitionSchema
>;

export const updateReportDefinitionSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    isShared: z.boolean().optional(),
    config: reportConfigSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Güncellenecek alan yok");
export type UpdateReportDefinitionInput = z.infer<
  typeof updateReportDefinitionSchema
>;

/**
 * What a delivered or downloaded report is packed as.
 *
 * CSV survives anywhere; XLSX carries numbers as numbers, which matters because
 * a Turkish-locale Excel reads "1234.56" out of a CSV as text and totals a
 * column of text as zero.
 */
export const ReportFileFormatEnum = z.enum(["CSV", "XLSX"]);
export type ReportFileFormat = z.infer<typeof ReportFileFormatEnum>;

export const REPORT_FILE_FORMAT_LABELS: Record<ReportFileFormat, string> = {
  CSV: "CSV",
  XLSX: "Excel (.xlsx)",
};

/**
 * Scheduled delivery of a saved report.
 *
 * `intervalMinutes: null` turns the schedule off — sending an explicit null is
 * how "stop mailing this" is expressed, and it also clears the queue position.
 * The floor of 60 is not a technical limit: a report mailed more often than
 * hourly is a notification, and nobody reads the twentieth spreadsheet.
 */
export const reportScheduleSchema = z
  .object({
    intervalMinutes: z.number().int().min(60).max(10080).nullable(),
    recipients: z
      .array(z.string().email("Geçerli bir e-posta girin").max(200))
      .max(20)
      .default([]),
    format: ReportFileFormatEnum.default("CSV"),
  })
  .refine(
    (v) => v.intervalMinutes === null || v.recipients.length > 0,
    "Gönderim için en az bir alıcı gerekli",
  );
export type ReportScheduleInput = z.infer<typeof reportScheduleSchema>;

/** Ad-hoc execution — the builder previews without saving anything. */
export const runReportSchema = z.object({
  dataset: ReportDatasetEnum,
  config: reportConfigSchema,
});
export type RunReportInput = z.infer<typeof runReportSchema>;
