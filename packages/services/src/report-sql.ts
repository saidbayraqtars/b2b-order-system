import { Prisma } from "@repo/database";
import type { Aggregate, ReportColumn, ReportConfig, ReportDataset } from "@repo/types";
import { BusinessError } from "./errors";
import { DATASETS, type DatasetDef, type ReportFieldDef } from "./report-registry";

// Grouped reports, answered by the database.
//
// The JS folding in report-engine.ts has to read every matching row before it
// can add anything up, which is why it carries a scan cap: past some size the
// alternative to a capped total is an out-of-memory error. A GROUP BY has no
// such problem — the database returns one row per group no matter how many rows
// it read — so an aggregate report goes through here and the cap disappears.
//
// **Why building SQL by hand is safe here, and only here.** Nothing in a report
// definition becomes an identifier. A field name is looked up in the registry
// first; what reaches this file is a `ReportFieldDef` whose `path` was written
// by us, which is turned into a column using aliases also written by us. Values
// — filter arguments, scope ids, limits — never appear in the string: they are
// bound parameters. If a field is not in the registry, the report fails before
// it gets here.
//
// The row scope is the same `scope()` declaration the Prisma path uses,
// translated below. Keeping one declaration is the point: a scope that existed
// on only one of the two paths would be a hole waiting for someone to press
// "group by".

/**
 * Date buckets are cut in this zone, not the database's or the server's.
 *
 * "Sipariş tarihi (gün)" has to mean the day the customer would name. Postgres
 * stores timestamps in UTC, so a 01:30 order in Istanbul belongs to the
 * previous UTC day — grouping without a zone silently moves late-evening
 * business into yesterday.
 */
const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE ?? "Europe/Istanbul";

const TRUNC_FORMAT: Record<"day" | "month" | "year", string> = {
  day: "YYYY-MM-DD",
  month: "YYYY-MM",
  year: "YYYY",
};

/** Rows a grouped query may return. A report with more groups is not a report. */
export const MAX_GROUPS = 5_000;

function ident(name: string): Prisma.Sql {
  // Registry-authored names only — never a value from a report definition.
  return Prisma.raw(`"${name.replace(/"/g, '""')}"`);
}

function aliasFor(ds: DatasetDef, prefix: string): string {
  if (prefix === "") return ds.sql.alias;
  const join = ds.sql.joins.find((j) => j.prefix === prefix);
  if (!join) {
    // A registry field pointing through an undeclared relation. That is our
    // bug, not the user's, and it must not silently produce a wrong column.
    throw new BusinessError(
      "INVALID_REPORT",
      `Rapor tanımı bu alanı veritabanı tarafında gruplayamıyor (${prefix})`,
      { prefix },
    );
  }
  return join.alias;
}

/** `company.name` → `c."name"`, with the date bucket applied when there is one. */
function columnOf(ds: DatasetDef, def: ReportFieldDef): Prisma.Sql {
  const segments = def.path.split(".");
  const column = segments.pop()!;
  const alias = aliasFor(ds, segments.join("."));
  const base = Prisma.sql`${Prisma.raw(alias)}.${ident(column)}`;

  if (!def.trunc) return base;
  return Prisma.sql`to_char(${base} AT TIME ZONE ${REPORT_TIMEZONE}, ${TRUNC_FORMAT[def.trunc]})`;
}

function fromClause(ds: DatasetDef): Prisma.Sql {
  const joins = ds.sql.joins.map(
    (j) =>
      Prisma.sql` LEFT JOIN ${ident(j.table)} ${Prisma.raw(j.alias)} ON ${Prisma.raw(j.on)}`,
  );
  return Prisma.sql`${ident(ds.sql.table)} ${Prisma.raw(ds.sql.alias)}${Prisma.join(joins, "")}`;
}

// ─────────────────────────────────────────────
// WHERE
// ─────────────────────────────────────────────

/**
 * Translate a Prisma filter object into SQL.
 *
 * Only the shapes the registry actually produces are handled — nested relation
 * objects ending in a scalar equality, and the operator objects the filter
 * compiler emits. Anything else throws rather than being ignored, because a
 * silently dropped condition on a *scope* is a data leak.
 */
export function whereToSql(
  ds: DatasetDef,
  where: unknown,
  prefix = "",
): Prisma.Sql[] {
  if (!where || typeof where !== "object") return [];

  const parts: Prisma.Sql[] = [];

  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === "AND") {
      for (const clause of asArray(value)) parts.push(...whereToSql(ds, clause, prefix));
      continue;
    }
    if (key === "OR") {
      const branches = asArray(value)
        .map((clause) => whereToSql(ds, clause, prefix))
        .filter((b) => b.length > 0)
        .map((b) => Prisma.sql`(${Prisma.join(b, " AND ")})`);
      if (branches.length > 0) {
        parts.push(Prisma.sql`(${Prisma.join(branches, " OR ")})`);
      }
      continue;
    }
    if (key === "NOT") {
      const inner = whereToSql(ds, value, prefix);
      if (inner.length > 0) {
        parts.push(Prisma.sql`NOT (${Prisma.join(inner, " AND ")})`);
      }
      continue;
    }

    const path = prefix ? `${prefix}.${key}` : key;

    // A relation: recurse with the deeper prefix. Distinguished from an operator
    // object by whether the registry knows a join for the path.
    if (isPlainObject(value) && ds.sql.joins.some((j) => j.prefix === path)) {
      parts.push(...whereToSql(ds, value, path));
      continue;
    }

    const segments = path.split(".");
    const column = segments.pop()!;
    const alias = aliasFor(ds, segments.join("."));
    const col = Prisma.sql`${Prisma.raw(alias)}.${ident(column)}`;

    parts.push(...comparisonToSql(col, value));
  }

  return parts;
}

function comparisonToSql(col: Prisma.Sql, value: unknown): Prisma.Sql[] {
  if (value === null) return [Prisma.sql`${col} IS NULL`];

  if (!isPlainObject(value)) {
    return [Prisma.sql`${col} = ${value}`];
  }

  const out: Prisma.Sql[] = [];
  for (const [op, arg] of Object.entries(value)) {
    switch (op) {
      case "equals":
        out.push(arg === null ? Prisma.sql`${col} IS NULL` : Prisma.sql`${col} = ${arg}`);
        break;
      case "not":
        out.push(
          arg === null ? Prisma.sql`${col} IS NOT NULL` : Prisma.sql`${col} <> ${arg}`,
        );
        break;
      case "gt":
        out.push(Prisma.sql`${col} > ${arg}`);
        break;
      case "gte":
        out.push(Prisma.sql`${col} >= ${arg}`);
        break;
      case "lt":
        out.push(Prisma.sql`${col} < ${arg}`);
        break;
      case "lte":
        out.push(Prisma.sql`${col} <= ${arg}`);
        break;
      case "in":
        out.push(inClause(col, asArray(arg), false));
        break;
      case "notIn":
        out.push(inClause(col, asArray(arg), true));
        break;
      case "contains":
        out.push(Prisma.sql`${col}::text ILIKE ${`%${escapeLike(String(arg))}%`}`);
        break;
      case "startsWith":
        out.push(Prisma.sql`${col}::text ILIKE ${`${escapeLike(String(arg))}%`}`);
        break;
      case "endsWith":
        out.push(Prisma.sql`${col}::text ILIKE ${`%${escapeLike(String(arg))}`}`);
        break;
      case "mode":
        break; // Prisma's case-insensitivity flag; ILIKE already covers it.
      default:
        throw new BusinessError(
          "INVALID_REPORT",
          `Bu filtre veritabanı tarafında çalıştırılamıyor (${op})`,
          { operator: op },
        );
    }
  }
  return out;
}

function inClause(col: Prisma.Sql, values: unknown[], negate: boolean): Prisma.Sql {
  // An empty IN () is a syntax error in SQL and matches nothing in Prisma.
  if (values.length === 0) return negate ? Prisma.sql`TRUE` : Prisma.sql`FALSE`;
  const list = Prisma.join(values.map((v) => Prisma.sql`${v}`), ", ");
  return negate ? Prisma.sql`${col} NOT IN (${list})` : Prisma.sql`${col} IN (${list})`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Prisma.Decimal)
  );
}

// ─────────────────────────────────────────────
// SELECT
// ─────────────────────────────────────────────

function aggregateSql(fn: Aggregate, col: Prisma.Sql): Prisma.Sql {
  switch (fn) {
    case "COUNT":
      // COUNT(*) per group, which is what "adet" means to a person reading it —
      // not "rows where this column happens to be non-null".
      return Prisma.sql`COUNT(*)`;
    case "COUNT_DISTINCT":
      return Prisma.sql`COUNT(DISTINCT ${col})`;
    case "SUM":
      return Prisma.sql`SUM(${col})`;
    case "AVG":
      return Prisma.sql`AVG(${col})`;
    case "MIN":
      return Prisma.sql`MIN(${col})`;
    case "MAX":
      return Prisma.sql`MAX(${col})`;
  }
}

export interface GroupedQuery {
  sql: Prisma.Sql;
  /** Output alias per column key, in the order the report declares them. */
  keys: string[];
}

/**
 * Build the grouped SELECT.
 *
 * Output columns are named `c0`, `c1`, … rather than by the report's own keys:
 * a column key comes from user input (a custom label is allowed), and it has no
 * business being an SQL identifier. The caller maps positions back.
 */
export function buildGroupedQuery(params: {
  dataset: ReportDataset;
  config: ReportConfig;
  columns: ReportColumn[];
  columnKey: (c: ReportColumn) => string;
  where: Record<string, unknown>;
}): GroupedQuery {
  const ds = DATASETS[params.dataset];
  const { config, columns } = params;

  const selects: Prisma.Sql[] = [];
  const keys: string[] = [];
  const groupExprs: Prisma.Sql[] = [];

  columns.forEach((column, index) => {
    const def = ds.fields[column.field]!;
    const col = columnOf(ds, def);
    const out = Prisma.raw(`"c${index}"`);
    keys.push(params.columnKey(column));

    if (column.aggregate) {
      selects.push(Prisma.sql`${aggregateSql(column.aggregate, col)} AS ${out}`);
    } else {
      selects.push(Prisma.sql`${col} AS ${out}`);
      // Group by the *output alias*, not by repeating the expression. Postgres
      // accepts either, but a date bucket carries bound parameters, and the
      // same expression written twice gets different parameter positions — the
      // planner then cannot see they are equal and rejects the query.
      groupExprs.push(Prisma.sql`${out}`);
    }
  });

  const clauses = whereToSql(ds, params.where);
  const whereSql =
    clauses.length > 0 ? Prisma.sql` WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;

  const groupSql =
    groupExprs.length > 0
      ? Prisma.sql` GROUP BY ${Prisma.join(groupExprs, ", ")}`
      : Prisma.empty;

  // Sorting by an output column is safe and lets the database order aggregates:
  // ORDER BY "c3" DESC refers to the alias, never to anything the user wrote.
  const orderParts: Prisma.Sql[] = [];
  for (const sort of config.sort) {
    const index = keys.indexOf(sort.field);
    if (index === -1) continue;
    orderParts.push(
      Prisma.sql`${Prisma.raw(`"c${index}"`)} ${Prisma.raw(sort.direction === "desc" ? "DESC" : "ASC")} NULLS LAST`,
    );
  }
  const orderSql =
    orderParts.length > 0
      ? Prisma.sql` ORDER BY ${Prisma.join(orderParts, ", ")}`
      : Prisma.empty;

  // One past the limit, so the caller can tell "exactly full" from "there was
  // more" without a second query.
  const limit = Math.min(config.limit ?? MAX_GROUPS, MAX_GROUPS) + 1;

  return {
    keys,
    sql: Prisma.sql`SELECT ${Prisma.join(selects, ", ")} FROM ${fromClause(ds)}${whereSql}${groupSql}${orderSql} LIMIT ${limit}`,
  };
}
