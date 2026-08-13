import { Prisma, prisma } from "@repo/database";
import type {
  Aggregate,
  ColumnFormat,
  ReportColumn,
  ReportConfig,
  ReportDataset,
  ReportFilter,
} from "@repo/types";
import { BusinessError } from "./errors";
import {
  DATASETS,
  allowedAggregates,
  allowedOperators,
  buildSelect,
  defaultFormat,
  readPath,
  type ReportContext,
  type ReportFieldDef,
} from "./report-registry";
import { MAX_GROUPS, buildGroupedQuery } from "./report-sql";
import { FormulaError, compileFormula } from "./report-formula";

// Compiles a user-defined report into a Prisma query and runs it.
//
// Nothing from the config reaches the database by name: every field is resolved
// through the registry first, so an unknown field is an error rather than a
// lookup. The caller's row scope is ANDed on top of their filters, which is why
// running someone else's shared report is safe.

/**
 * Aggregation runs in the database (see report-sql.ts), so an aggregate report
 * no longer reads rows into memory and no scan cap applies to it. What is
 * bounded now is the number of *groups* returned — a report with more than that
 * is not a report anyone reads, and saying so beats streaming it.
 */
const DEFAULT_DETAIL_LIMIT = 500;

export interface ReportColumnOut {
  key: string;
  label: string;
  type: string;
  format: ColumnFormat;
  aggregate: Aggregate | null;
  width: number | null;
}

export type ReportCellValue = string | number | boolean | null;

export interface ReportRunResult {
  dataset: ReportDataset;
  columns: ReportColumnOut[];
  rows: Record<string, ReportCellValue>[];
  rowCount: number;
  /**
   * Rows the database read to answer this. Aggregates are folded server-side,
   * so for a grouped report this is the number of groups, not of source rows.
   */
  scannedRows: number;
  /** True when the result was cut short — there was more than the limit. */
  truncated: boolean;
  grouped: boolean;
  chart: ReportConfig["chart"] | null;
  generatedAt: string;
}

// ─────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────

function invalid(message: string, details?: Record<string, unknown>): never {
  throw new BusinessError("INVALID_REPORT", message, details);
}

/**
 * Check a config against the registry and return a normalised copy.
 * Runs on save AND on execution — a config edited directly in the database gets
 * the same treatment as one that just arrived over HTTP.
 */
export function normalizeConfig(
  dataset: ReportDataset,
  config: ReportConfig,
): ReportConfig {
  const ds = DATASETS[dataset];
  if (!ds) invalid("Bilinmeyen veri kümesi", { dataset });

  const field = (key: string, where: string): ReportFieldDef => {
    const f = ds.fields[key];
    if (!f) invalid(`${where}: "${key}" alanı bu veri kümesinde yok`, { key });
    return f;
  };

  // ── columns ──
  const columns: ReportColumn[] = config.columns.map((c) => {
    const f = field(c.field, "Sütun");
    if (c.aggregate && !allowedAggregates(f).includes(c.aggregate)) {
      invalid(`"${f.label}" alanına ${c.aggregate} özeti uygulanamaz`, {
        field: c.field,
        aggregate: c.aggregate,
      });
    }
    return { ...c, format: c.format ?? defaultFormat(f) };
  });

  // ── groupBy ──
  for (const key of config.groupBy) {
    const f = field(key, "Gruplama");
    if (!f.groupable) {
      invalid(`"${f.label}" alanına göre gruplanamaz`, { field: key });
    }
  }

  const hasAggregate = columns.some((c) => c.aggregate);
  const grouped = config.groupBy.length > 0;

  // A grouped report must say what to do with every non-key column, and an
  // ungrouped one cannot mix a total with a detail row.
  const plainColumns = columns.filter(
    (c) => !c.aggregate && !config.groupBy.includes(c.field),
  );
  if ((grouped || hasAggregate) && plainColumns.length > 0) {
    invalid(
      `"${field(plainColumns[0]!.field, "Sütun").label}" ya gruplama alanı olmalı ya da bir özet fonksiyonu almalı`,
      { field: plainColumns[0]!.field },
    );
  }

  // Group keys always come out as columns, prepended, so the output is readable
  // even if the user only picked aggregates.
  const missingKeys = config.groupBy.filter(
    (key) => !columns.some((c) => c.field === key && !c.aggregate),
  );
  const finalColumns: ReportColumn[] = [
    ...missingKeys.map((key) => ({
      field: key,
      format: defaultFormat(field(key, "Gruplama")),
    })),
    ...columns,
  ];

  // ── filters ──
  const filters = config.filters.map((f) => {
    const def = field(f.field, "Filtre");
    if (!allowedOperators(def).includes(f.operator)) {
      invalid(`"${def.label}" alanına "${f.operator}" filtresi uygulanamaz`, {
        field: f.field,
        operator: f.operator,
      });
    }
    assertFilterValue(def, f);
    return f;
  });

  // Hidden columns are kept in the definition (so the builder can toggle them
  // back) but never appear in the output, so nothing may reference them.
  const outKeys = new Set(
    finalColumns.filter((c) => !c.hidden).map(columnKey),
  );

  // ── computed ──
  // Each one may read the source columns and any computed column declared
  // before it; the order in the array is the order they are worked out in, so
  // that is also the order they may refer to each other in. Nothing here can
  // reach the database — see report-formula.ts.
  const computedKeys = new Set<string>();
  // `?? []` on purpose: a report saved before computed columns existed has no
  // such key, and reading one must not depend on Zod having filled it in.
  const computed = (config.computed ?? []).map((c) => {
    if (outKeys.has(c.key) || computedKeys.has(c.key)) {
      invalid(`"${c.key}" adında bir sütun zaten var`, { key: c.key });
    }
    try {
      compileFormula(c.expression, new Set([...outKeys, ...computedKeys]));
    } catch (err) {
      if (err instanceof FormulaError) {
        invalid(`"${c.label}": ${err.message}`, { key: c.key });
      }
      throw err;
    }
    computedKeys.add(c.key);
    return { ...c, format: c.format ?? ("number" as const) };
  });

  // ── sort ──
  const sort = config.sort.filter((s) => {
    if (computedKeys.has(s.field)) {
      // Ordering happens in the database and a computed column does not exist
      // there. Sorting the page we already fetched would order a slice rather
      // than the report, which reads like a top-10 and is not one.
      invalid(
        `Hesaplanmış sütuna göre sıralanamaz ("${s.field}") — sıralama veritabanında yapılıyor`,
        { field: s.field },
      );
    }
    if (!outKeys.has(s.field)) {
      invalid(`Sıralama alanı "${s.field}" çıktı sütunları arasında değil`, {
        field: s.field,
      });
    }
    return true;
  });

  // ── chart ──
  // Charts are drawn from the finished rows, so a computed column can carry
  // one.
  const chartKeys = new Set([...outKeys, ...computedKeys]);
  let chart = config.chart;
  if (chart && chart.type !== "table") {
    if (!chart.categoryField || !chartKeys.has(chart.categoryField)) {
      invalid("Grafik için geçerli bir etiket sütunu seçin");
    }
    if (!chart.valueField || !chartKeys.has(chart.valueField)) {
      invalid("Grafik için geçerli bir değer sütunu seçin");
    }
  }
  if (chart?.type === "table") chart = { type: "table" };

  return {
    columns: finalColumns,
    computed,
    filters,
    groupBy: config.groupBy,
    sort,
    limit: config.limit,
    chart,
  };
}

function assertFilterValue(def: ReportFieldDef, filter: ReportFilter): void {
  const { operator, value } = filter;
  if (operator === "isNull" || operator === "notNull") return;

  if (operator === "in" || operator === "notIn") {
    if (!Array.isArray(value) || value.length === 0) {
      invalid(`"${def.label}" için en az bir değer seçin`, { field: filter.field });
    }
    if (def.enumValues) {
      for (const v of value) {
        if (!def.enumValues.includes(String(v))) {
          invalid(`"${def.label}" için geçersiz değer: ${String(v)}`, {
            field: filter.field,
          });
        }
      }
    }
    return;
  }

  if (operator === "between") {
    if (!Array.isArray(value) || value.length !== 2) {
      invalid(`"${def.label}" için iki değer girin`, { field: filter.field });
    }
    return;
  }

  if (value === undefined || value === null || value === "") {
    invalid(`"${def.label}" için bir değer girin`, { field: filter.field });
  }

  if (operator === "lastNDays") {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 3650) {
      invalid(`"${def.label}" için 1-3650 arası gün sayısı girin`, {
        field: filter.field,
      });
    }
    return;
  }

  if (def.type === "enum" && def.enumValues && !def.enumValues.includes(String(value))) {
    invalid(`"${def.label}" için geçersiz değer: ${String(value)}`, {
      field: filter.field,
    });
  }

  if ((def.type === "number" || def.type === "money") && Number.isNaN(Number(value))) {
    invalid(`"${def.label}" sayısal bir değer bekliyor`, { field: filter.field });
  }

  if (def.type === "date" && Number.isNaN(Date.parse(String(value)))) {
    invalid(`"${def.label}" geçerli bir tarih bekliyor`, { field: filter.field });
  }
}

/** Output key for a column: aggregated columns get suffixed so both can coexist. */
export function columnKey(c: ReportColumn): string {
  return c.aggregate ? `${c.field}__${c.aggregate.toLowerCase()}` : c.field;
}

// ─────────────────────────────────────────────
// FILTER → PRISMA WHERE
// ─────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function leafCondition(def: ReportFieldDef, filter: ReportFilter): unknown {
  const { operator, value } = filter;
  const asDate = (v: unknown) => new Date(String(v));
  const asNum = (v: unknown) => Number(v);
  const typed = (v: unknown) =>
    def.type === "date"
      ? asDate(v)
      : def.type === "number" || def.type === "money"
        ? asNum(v)
        : def.type === "boolean"
          ? v === true || v === "true"
          : String(v);

  switch (operator) {
    case "eq":
      return { equals: typed(value) };
    case "neq":
      return { not: typed(value) };
    case "contains":
      return { contains: String(value), mode: "insensitive" };
    case "startsWith":
      return { startsWith: String(value), mode: "insensitive" };
    case "in":
      return { in: (value as unknown[]).map(typed) };
    case "notIn":
      return { notIn: (value as unknown[]).map(typed) };
    case "gt":
      return { gt: typed(value) };
    case "gte":
      return { gte: typed(value) };
    case "lt":
      return { lt: typed(value) };
    case "lte":
      return { lte: typed(value) };
    case "between": {
      const [a, b] = value as [unknown, unknown];
      return { gte: typed(a), lte: typed(b) };
    }
    case "isNull":
      return { equals: null };
    case "notNull":
      return { not: null };
    case "lastNDays": {
      // Rolling window from the start of the day N-1 days ago, so "son 7 gün"
      // means seven calendar days including today.
      const start = new Date(Date.now() - (Number(value) - 1) * DAY_MS);
      start.setHours(0, 0, 0, 0);
      return { gte: start };
    }
    default:
      return invalid(`Desteklenmeyen filtre: ${operator}`);
  }
}

/** Nest a leaf condition down the field's relation path. */
function nest(path: string, condition: unknown): Record<string, unknown> {
  const parts = path.split(".");
  let node: unknown = condition;
  for (let i = parts.length - 1; i >= 0; i--) {
    node = { [parts[i]!]: node };
  }
  return node as Record<string, unknown>;
}

export function compileWhere(
  dataset: ReportDataset,
  filters: ReportFilter[],
  ctx: ReportContext,
): Record<string, unknown> {
  const ds = DATASETS[dataset];
  const clauses: Record<string, unknown>[] = filters.map((f) => {
    const def = ds.fields[f.field];
    if (!def) invalid(`Bilinmeyen filtre alanı: ${f.field}`);
    return nest(def.path, leafCondition(def, f));
  });

  const scope = ds.scope(ctx);
  // Scope last and always ANDed — a user filter can narrow it, never replace it.
  return { AND: [...clauses, scope] };
}

// ─────────────────────────────────────────────
// EXECUTION
// ─────────────────────────────────────────────

export async function runReport(
  dataset: ReportDataset,
  rawConfig: ReportConfig,
  ctx: ReportContext,
): Promise<ReportRunResult> {
  const config = normalizeConfig(dataset, rawConfig);
  const ds = DATASETS[dataset];
  const columns = config.columns.filter((c) => !c.hidden);

  const where = compileWhere(dataset, config.filters, ctx);
  const paths = [...new Set(columns.map((c) => ds.fields[c.field]!.path))];
  const select = buildSelect(paths);

  const grouped = config.groupBy.length > 0;
  const hasAggregate = columns.some((c) => c.aggregate);
  const detail = !grouped && !hasAggregate;

  let rows: Record<string, ReportCellValue>[];
  let scannedRows: number;
  let truncated = false;

  if (detail) {
    // A plain listing is ordered and limited by the database already.
    const take = config.limit ?? DEFAULT_DETAIL_LIMIT;
    const orderBy = detailOrderBy(dataset, config);
    const delegate = prisma[ds.model] as {
      findMany: (args: unknown) => Promise<unknown[]>;
    };
    const raw = await delegate.findMany({
      where,
      select,
      take,
      ...(orderBy ? { orderBy } : {}),
    });
    rows = raw
      .map((row) => flattenRow(dataset, columns, row))
      .map((r) => emit(columns, r));
    scannedRows = raw.length;
  } else {
    const result = await runGrouped(dataset, config, columns, where);
    rows = result.rows;
    scannedRows = rows.length;
    truncated = result.truncated;
  }

  const outColumns: ReportColumnOut[] = columns.map((c) => {
    const def = ds.fields[c.field]!;
    return {
      key: columnKey(c),
      label: c.label ?? labelFor(def, c.aggregate),
      type: def.type,
      format: c.aggregate === "COUNT" || c.aggregate === "COUNT_DISTINCT"
        ? "number"
        : (c.format ?? defaultFormat(def)),
      aggregate: c.aggregate ?? null,
      width: c.width ?? null,
    };
  });

  // Computed columns are worked out here, on the rows the database returned,
  // and in the order they were declared so that one may build on the last.
  for (const c of config.computed ?? []) {
    const formula = compileFormula(
      c.expression,
      new Set(outColumns.map((o) => o.key)),
    );
    for (const row of rows) {
      row[c.key] = formula.evaluate(row);
    }
    outColumns.push({
      key: c.key,
      label: c.label,
      type: "number",
      format: c.format ?? "number",
      aggregate: null,
      width: c.width ?? null,
    });
  }

  return {
    dataset,
    columns: outColumns,
    rows,
    rowCount: rows.length,
    scannedRows,
    truncated,
    grouped,
    chart: config.chart ?? null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Run the aggregation as a GROUP BY.
 *
 * The database returns one row per group, so nothing here scales with the size
 * of the underlying table — which is the whole reason this replaced the JS fold
 * and its 20 000-row cap. Values come back as Postgres types (numeric strings,
 * Dates), so they go through the same `toCell` every other path uses.
 */
async function runGrouped(
  dataset: ReportDataset,
  config: ReportConfig,
  columns: ReportColumn[],
  where: Record<string, unknown>,
): Promise<{ rows: Record<string, ReportCellValue>[]; truncated: boolean }> {
  const query = buildGroupedQuery({
    dataset,
    config,
    columns,
    columnKey,
    where,
  });

  const raw = await prisma.$queryRaw<Record<string, unknown>[]>(query.sql);

  const limit = Math.min(config.limit ?? MAX_GROUPS, MAX_GROUPS);
  const truncated = raw.length > limit;
  const kept = truncated ? raw.slice(0, limit) : raw;

  const ds = DATASETS[dataset];
  const rows = kept.map((row) => {
    const out: Record<string, ReportCellValue> = {};
    query.keys.forEach((key, index) => {
      const column = columns[index]!;
      const raw = row[`c${index}`];
      out[key] = column.aggregate
        ? toAggregateCell(ds.fields[column.field]!, column.aggregate, raw)
        : toCell(raw);
    });
    return out;
  });

  return { rows, truncated };
}

function labelFor(def: ReportFieldDef, aggregate?: Aggregate): string {
  if (!aggregate) return def.label;
  const suffix: Record<Aggregate, string> = {
    SUM: "toplam",
    COUNT: "adet",
    COUNT_DISTINCT: "benzersiz",
    AVG: "ortalama",
    MIN: "en küçük",
    MAX: "en büyük",
  };
  return `${def.label} (${suffix[aggregate]})`;
}

/** Push ordering into the database for detail listings. */
function detailOrderBy(
  dataset: ReportDataset,
  config: ReportConfig,
): Record<string, unknown> | undefined {
  const ds = DATASETS[dataset];
  const first = config.sort[0];
  if (first) {
    const column = config.columns.find((c) => columnKey(c) === first.field);
    const def = column ? ds.fields[column.field] : undefined;
    if (def) return nest(def.path, first.direction);
  }
  const fallback = ds.fields[ds.defaultSort.field];
  return fallback ? nest(fallback.path, ds.defaultSort.direction) : undefined;
}

/** Read every referenced field out of a Prisma row, applying date truncation. */
function flattenRow(
  dataset: ReportDataset,
  columns: ReportColumn[],
  row: unknown,
): Record<string, unknown> {
  const ds = DATASETS[dataset];
  const out: Record<string, unknown> = {};
  for (const c of columns) {
    if (c.field in out) continue;
    const def = ds.fields[c.field]!;
    const value = readPath(row, def.path);
    out[c.field] = def.trunc ? truncateDate(value, def.trunc) : value;
  }
  return out;
}

function truncateDate(value: unknown, unit: "day" | "month" | "year"): string | null {
  if (!(value instanceof Date)) return null;
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  if (unit === "year") return `${y}`;
  if (unit === "month") return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

/** Detail row → wire values. */
function emit(
  columns: ReportColumn[],
  flat: Record<string, unknown>,
): Record<string, ReportCellValue> {
  const out: Record<string, ReportCellValue> = {};
  for (const c of columns) {
    out[columnKey(c)] = toCell(flat[c.field]);
  }
  return out;
}

function toCell(value: unknown): ReportCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return Number(value.toFixed(2));
  // Raw SQL hands back what Postgres has: COUNT is bigint, SUM/AVG over money
  // is numeric, and the driver renders those as BigInt and string. A total that
  // arrived as "2400" is still a total, so it goes out as one.
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

/**
 * Same, for a value that came out of an aggregate. The column's own type
 * decides: a SUM of money is a number even though the driver said "2400.00",
 * while a MAX of a date must stay a date.
 */
function toAggregateCell(
  def: ReportFieldDef,
  aggregate: Aggregate,
  value: unknown,
): ReportCellValue {
  if (value === null || value === undefined) return null;

  const numeric =
    aggregate === "COUNT" ||
    aggregate === "COUNT_DISTINCT" ||
    aggregate === "AVG" ||
    aggregate === "SUM" ||
    def.type === "number" ||
    def.type === "money";

  if (numeric) {
    const n = Number(value instanceof Prisma.Decimal ? value.toFixed(4) : value);
    return Number.isNaN(n) ? toCell(value) : Number(n.toFixed(2));
  }
  return toCell(value);
}


