import type sql from "mssql";
import type { AgentConfig } from "./config";
import { periodTable } from "./vega";

// Sipariş tablolarının **gerçek** hâli — salt okunur.
//
// Yazma kodunu bir kılavuzdan yazmak yetmiyor: kılavuzun kendisi (§43.2) "aynı
// işlemi VegaWin'de elle girin ve ne yazdığına bakın" diyor. Bu komut o adımın
// veritabanı tarafını yapıyor — bu kurulumda hangi sütunlar var, seri hangi
// önekle yürüyor, Vega'nın kendi yazdığı bir sipariş başlığı neye benziyor.
//
// Bunu yazmadan önce kurulum şöyle ilerliyordu: yaz, Vega'da aç, görünmüyorsa
// neden görünmediğini tahmin et. Artık önce bakılıyor.
//
// Hiçbir şey yazmaz; `write.enabled` kapalıyken de çalışır. Zaten sırası o:
// önce buraya bakılır, sonra kilit açılır.

export interface ColumnReport {
  name: string;
  type: string;
  /** Metin sütunlarında karakter sınırı (bayt değil). */
  maxChars: number | null;
  nullable: boolean;
  identity: boolean;
}

export interface TableReport {
  table: string;
  exists: boolean;
  rowCount: number | null;
  columns: ColumnReport[];
}

export interface SeriesReport {
  prefix: string;
  count: number;
  lastNumber: string | null;
}

export interface DescribeOrdersResult {
  header: TableReport;
  line: TableReport;
  /** Bu tabloda yürüyen belge serileri — kendi önekimizi seçerken bakılacak yer. */
  series: SeriesReport[];
  /** Ayarlardaki önek ve referans sütunu bu kurulumda kullanılabilir mi. */
  configured: {
    orderPrefix: string;
    referenceColumn: string;
    referenceColumnExists: boolean;
    referenceColumnInUse: number | null;
  };
  /**
   * Vega'nın kendi yazdığı son siparişin dolu alanları.
   *
   * The point of comparison for everything this agent writes. Values are the
   * customer's own data and stay between their ERP and their own B2B — the same
   * boundary every other reading crosses.
   */
  sampleHeader: Record<string, string> | null;
  sampleLine: Record<string, string> | null;
}

const SAMPLE_VALUE_LIMIT = 200;

async function query<T>(
  pool: sql.ConnectionPool,
  text: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const request = pool.request();
  for (const [name, value] of Object.entries(params)) request.input(name, value);
  const result = await request.query<T>(text);
  return result.recordset ?? [];
}

async function describeTable(pool: sql.ConnectionPool, table: string): Promise<TableReport> {
  const columns = await query<{
    name: string;
    type: string;
    bytes: number;
    nullable: boolean;
    identity: boolean;
  }>(
    pool,
    `SELECT c.name AS [name], ty.name AS [type], c.max_length AS [bytes],
            c.is_nullable AS [nullable], c.is_identity AS [identity]
       FROM sys.columns c
       JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      WHERE c.object_id = OBJECT_ID(@table)
      ORDER BY c.column_id`,
    { table },
  );

  if (columns.length === 0) {
    return { table, exists: false, rowCount: null, columns: [] };
  }

  const counted = await query<{ rows: number }>(
    pool,
    `SELECT COUNT_BIG(*) AS [rows] FROM [${table}]`,
  );

  return {
    table,
    exists: true,
    rowCount: counted[0] ? Number(counted[0].rows) : null,
    columns: columns.map((c) => {
      const type = String(c.type).toLowerCase();
      const bytes = Number(c.bytes);
      let maxChars: number | null = null;
      if (bytes > 0) {
        // Kılavuz Kural 8: max_length BAYT'tır, nvarchar iki bayt/karakter.
        if (type === "nvarchar" || type === "nchar") maxChars = bytes / 2;
        else if (type === "varchar" || type === "char") maxChars = bytes;
      }
      return {
        name: String(c.name),
        type,
        maxChars,
        nullable: Boolean(c.nullable),
        identity: Boolean(c.identity),
      };
    }),
  };
}

/**
 * Seride yürüyen önekler (kılavuz §21.5).
 *
 * Tek harf varsayımı yanlış: ilk müşterinin gerçek fatura serisi
 * `MSA2026000000001`. Önek = ilk rakama kadarki baştaki bölüm.
 */
async function describeSeries(pool: sql.ConnectionPool, table: string): Promise<SeriesReport[]> {
  return query<SeriesReport>(
    pool,
    `SELECT TOP 20 onek AS [prefix], COUNT(*) AS [count], MAX(BELGENO) AS [lastNumber]
       FROM (
         SELECT LEFT(BELGENO, PATINDEX('%[0-9]%', BELGENO + '0') - 1) AS onek, BELGENO
           FROM [${table}]
          WHERE BELGENO IS NOT NULL AND LEN(LTRIM(RTRIM(BELGENO))) > 1
       ) x
      WHERE LEN(onek) > 0
      GROUP BY onek
      ORDER BY COUNT(*) DESC`,
  );
}

/** NTEXT sütunlarında LTRIM/MAX çalışmaz (kılavuz Kural 9) — okurken çevrilir. */
function readableColumn(name: string, type: string): string {
  if (type === "ntext" || type === "text" || type === "image") {
    return `CAST([${name}] AS NVARCHAR(4000))`;
  }
  return `[${name}]`;
}

async function sampleRow(
  pool: sql.ConnectionPool,
  table: string,
  columns: ColumnReport[],
  where: string,
  params: Record<string, unknown>,
  order: string,
): Promise<Record<string, string> | null> {
  if (columns.length === 0) return null;
  const projection = columns
    .map((c) => `${readableColumn(c.name, c.type)} AS [${c.name}]`)
    .join(", ");
  const rows = await query<Record<string, unknown>>(
    pool,
    `SELECT TOP 1 ${projection} FROM [${table}] ${where} ORDER BY ${order}`,
    params,
  );
  const row = rows[0];
  if (!row) return null;

  // Dolu alanlar. Boşları basmak, "Vega bunu doldurur mu" sorusuna cevap veren
  // listeyi yüz satır gürültüyle gömerdi.
  const filled: Record<string, string> = {};
  for (const [name, value] of Object.entries(row)) {
    if (value == null) continue;
    const text = value instanceof Date ? value.toISOString() : String(value);
    if (text.trim() === "") continue;
    filled[name] = text.slice(0, SAMPLE_VALUE_LIMIT);
  }
  return filled;
}

export async function describeOrderTables(
  pool: sql.ConnectionPool,
  cfg: AgentConfig,
): Promise<DescribeOrdersResult> {
  const headerTable = periodTable(cfg, "ALSIPBASLIK");
  const lineTable = periodTable(cfg, "ALSIPHAREKET");

  const header = await describeTable(pool, headerTable);
  const line = await describeTable(pool, lineTable);
  const series = header.exists ? await describeSeries(pool, headerTable) : [];

  const referenceColumn = cfg.write.referenceColumn;
  const referenceColumnExists = header.columns.some(
    (c) => c.name.toUpperCase() === referenceColumn.toUpperCase(),
  );

  let referenceColumnInUse: number | null = null;
  if (referenceColumnExists) {
    // Vega'nın kendisi bu sütunu kullanıyorsa, mükerrer kontrolü başkasının
    // verisine çarpar — operatörün bunu yazmadan önce görmesi gerekiyor.
    const used = await query<{ used: number }>(
      pool,
      `SELECT COUNT_BIG(*) AS [used] FROM [${headerTable}]
        WHERE ISNULL(LTRIM(RTRIM(CAST([${referenceColumn}] AS NVARCHAR(4000)))), '') <> ''`,
    );
    referenceColumnInUse = used[0] ? Number(used[0].used) : null;
  }

  const sampleHeader = header.exists
    ? await sampleRow(pool, headerTable, header.columns, "WHERE BELGETIPI = @tip", { tip: 60 }, "IND DESC")
    : null;

  let sampleLine: Record<string, string> | null = null;
  if (line.exists && sampleHeader?.IND) {
    sampleLine = await sampleRow(
      pool,
      lineTable,
      line.columns,
      "WHERE EVRAKNO = @evrak",
      { evrak: Number(sampleHeader.IND) },
      "IND ASC",
    );
  }

  return {
    header,
    line,
    series,
    configured: {
      orderPrefix: cfg.write.orderPrefix,
      referenceColumn,
      referenceColumnExists,
      referenceColumnInUse,
    },
    sampleHeader,
    sampleLine,
  };
}
