import { randomUUID } from "node:crypto";
import sql from "mssql";

// VegaWin A5 (VegaDB) yazma ilkelleri.
//
// Everything in `vega.ts` is read-only and stays that way. This file is the
// other half: the *only* place in this system that writes to a customer's
// accounting database. It follows the Vega guide's Part VII to the letter —
// schema-adaptive INSERT (§44), one transaction per document (§45), locked
// document numbering (§46) — because every rule there came from a real
// document that landed silently broken.
//
// Two properties hold no matter what the B2B sends:
//
//  1. **No SQL crosses the wire.** The B2B names a command; the statements are
//     the ones written here. Same boundary `vega.ts` documents for reads.
//  2. **Nothing writes while the lock is on.** `write.enabled` is false in the
//     shipped config, and the database login should keep `db_datareader` only
//     until an operator has walked the guide's checklist (§43.2).

/** Vega'nın "boş tarih"i — Delphi TDateTime sıfırı (kılavuz §22.3). */
export const EMPTY_DATE = new Date(1899, 11, 30);

/**
 * `GK` — hareket satırlarındaki rastgele int32 kimlik (kılavuz §22.1).
 *
 * Real data settled this: 14 otherwise identical rows carry 14 different GKs,
 * so it is not a checksum of the row. Vega fills it on every row it writes, so
 * we do too.
 */
export function gk(): number {
  return Math.floor(Math.random() * 4294967296) - 2147483648;
}

/** `{ABCD-...}` — Vega'nın başlıklarda kullandığı küme parantezli GUID (§22.4). */
export function uid(): string {
  return `{${randomUUID().toUpperCase()}}`;
}

/** Tipli parametre — para ve miktar alanları çıkarıma bırakılmaz. */
export interface TypedValue {
  type: sql.ISqlType;
  value: unknown;
}

function isTyped(v: unknown): v is TypedValue {
  return typeof v === "object" && v !== null && "type" in v && "value" in v;
}

/** DECIMAL(18,4) — fiyat, miktar ve tutar alanları için. */
export function dec(value: number): TypedValue {
  return { type: sql.Decimal(18, 4) as unknown as sql.ISqlType, value };
}

/** Bir SQL ifadesi (parametre değil): `GETDATE()` gibi. */
export interface RawExpr {
  sql: string;
}

export function raw(expression: string): RawExpr {
  return { sql: expression };
}

export interface Tx {
  query<T = Record<string, unknown>>(
    text: string,
    params?: Record<string, unknown>,
  ): Promise<T[]>;
  run(text: string, params?: Record<string, unknown>): Promise<number[]>;
}

/**
 * Tek işlem kuralı (kılavuz §45.1).
 *
 * A document's rows all go in one transaction: if one step fails none of them
 * survive. Half a document is worse than none — it is invisible in Vega's own
 * screens and turns up weeks later as a number that will not tie.
 */
export async function withTransaction<T>(
  pool: sql.ConnectionPool,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  function request(params?: Record<string, unknown>): sql.Request {
    const req = new sql.Request(transaction);
    for (const [name, value] of Object.entries(params ?? {})) {
      if (isTyped(value)) req.input(name, value.type, value.value);
      else req.input(name, value);
    }
    return req;
  }

  let done = false;
  try {
    const tx: Tx = {
      query: async <T2>(text: string, params?: Record<string, unknown>) =>
        ((await request(params).query(text)).recordset ?? []) as T2[],
      run: async (text: string, params?: Record<string, unknown>) =>
        (await request(params).query(text)).rowsAffected ?? [],
    };
    const result = await work(tx);
    await transaction.commit();
    done = true;
    return result;
  } finally {
    if (!done) {
      // A failed rollback must not mask the error that caused it — the caller
      // is about to report something more useful than "rollback failed".
      await transaction.rollback().catch(() => undefined);
    }
  }
}

export interface ColumnInfo {
  /** Sabit genişlikli metin sütunlarında karakter sınırı, değilse null. */
  maxChars: number | null;
}

/**
 * Tablonun gerçek sütunları (kılavuz §44.2).
 *
 * The same Vega version installs with different column sets from customer to
 * customer, and an INSERT naming a column that is not there drops the whole
 * document. So every INSERT is built from what the table actually has.
 *
 * `max_length` is in **bytes** (kılavuz Kural 8): nvarchar/nchar spend two per
 * character, which is how a 52-character note once failed to fit an
 * nvarchar(100) column.
 */
export async function readColumns(tx: Tx, table: string): Promise<Map<string, ColumnInfo>> {
  const rows = await tx.query<{ name: string; type: string; bytes: number }>(
    `SELECT c.name AS name, ty.name AS type, c.max_length AS bytes
       FROM sys.columns c
       JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      WHERE c.object_id = OBJECT_ID(@table)
        AND c.is_identity = 0
        AND c.is_computed = 0`,
    { table },
  );
  if (rows.length === 0) {
    throw new Error(`Tablo bulunamadı ya da okunamadı: ${table}`);
  }

  const columns = new Map<string, ColumnInfo>();
  for (const row of rows) {
    const type = String(row.type).toLowerCase();
    const bytes = Number(row.bytes);
    let maxChars: number | null = null;
    if (bytes > 0) {
      if (type === "nvarchar" || type === "nchar") maxChars = bytes / 2;
      else if (type === "varchar" || type === "char") maxChars = bytes;
    }
    columns.set(String(row.name).toUpperCase(), { maxChars });
  }
  return columns;
}

export interface InsertOptions {
  /** Bu sütunlardan biri tabloda yoksa belge hiç yazılmaz. */
  required?: readonly string[];
  /** Parametre olmayan SQL ifadeleri: `{ CREDATE: raw("GETDATE()") }`. */
  expressions?: Record<string, RawExpr>;
  /** IDENTITY okunmayacaksa false — sipariş tablolarında hep okunur. */
  returnIdentity?: boolean;
}

/**
 * Şemaya uyumlu tek satır INSERT (kılavuz §44.2).
 *
 * Fields the table does not have are dropped silently — that is the point, it
 * is how one installation's missing column stops being everyone's failure.
 * What is *not* silent: a column listed in `required` and missing stops the
 * write with a message naming it, because those are the ones whose absence
 * would produce a document Vega cannot open.
 */
export async function insertRow(
  tx: Tx,
  table: string,
  columns: Map<string, ColumnInfo>,
  fields: Record<string, unknown>,
  options: InsertOptions = {},
): Promise<number | null> {
  for (const name of options.required ?? []) {
    if (!columns.has(name.toUpperCase())) {
      throw new Error(
        `${table} tablosunda beklenen "${name}" sütunu yok. Vega sürümü farklı olabilir — ` +
          `describeOrderTables komutuyla gerçek sütunlara bakın.`,
      );
    }
  }

  const names: string[] = [];
  const placeholders: string[] = [];
  const params: Record<string, unknown> = {};
  let index = 0;

  for (const [field, value] of Object.entries(fields)) {
    const info = columns.get(field.toUpperCase());
    if (!info) continue;

    const parameter = `p${index++}`;
    names.push(`[${field}]`);
    placeholders.push(`@${parameter}`);

    // Trim to the column's real width rather than a guessed one: that is the
    // whole reason the widths were read above.
    if (typeof value === "string" && info.maxChars && value.length > info.maxChars) {
      params[parameter] = value.slice(0, info.maxChars);
    } else {
      params[parameter] = value;
    }
  }

  for (const [field, expression] of Object.entries(options.expressions ?? {})) {
    if (!columns.has(field.toUpperCase())) continue;
    names.push(`[${field}]`);
    placeholders.push(expression.sql);
  }

  if (names.length === 0) {
    throw new Error(`${table} için yazılacak sütun bulunamadı.`);
  }

  const output = options.returnIdentity === false ? "" : "OUTPUT INSERTED.IND AS ind";
  const rows = await tx.query<{ ind: number }>(
    `INSERT INTO [${table}] (${names.join(", ")}) ${output} VALUES (${placeholders.join(", ")})`,
    params,
  );
  const first = rows[0];
  return first ? Number(first.ind) : null;
}

/**
 * Sıradaki belge numarası, kilitli okumayla (kılavuz §46.1).
 *
 * `UPDLOCK, HOLDLOCK` holds the range to the end of the transaction, so a
 * second writer waits instead of taking the same number. That only covers our
 * own copies — the guide's second defence covers VegaWin's own screen:
 * **use a prefix Vega does not use** (§46.3), which is why the shipped default
 * is `B` and not `A`.
 *
 * The counter width is read off the series rather than assumed: the first
 * customer's real invoice series is `MSA2026000000001`, not `A0000001`.
 */
export async function nextDocumentNumber(
  tx: Tx,
  table: string,
  prefix: string,
  fallbackWidth = 7,
): Promise<string> {
  const start = prefix.length + 1;
  const rows = await tx.query<{ last: number | null; width: number | null }>(
    `SELECT MAX(CAST(SUBSTRING(BELGENO, @start, 20) AS BIGINT)) AS last,
            MAX(LEN(SUBSTRING(BELGENO, @start, 20)))            AS width
       FROM [${table}] WITH (UPDLOCK, HOLDLOCK)
      WHERE BELGENO LIKE @pattern
        AND ISNUMERIC(SUBSTRING(BELGENO, @start, 20)) = 1`,
    { start, pattern: `${prefix}%` },
  );

  const row = rows[0];
  const next = Number(row?.last ?? 0) + 1;
  const width = Number(row?.width ?? 0) || fallbackWidth;
  return prefix + String(next).padStart(width, "0");
}
