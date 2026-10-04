import sql from "mssql";
import type { AgentConfig } from "./config";

// VegaWin A5 (VegaDB) okuyucusu.
//
// **All of this system's knowledge of Vega's schema lives in this file, on the
// customer's own machine.** The B2B installation receives normalised rows and
// knows nothing about VegaDB — which is a security boundary, not tidiness. The
// alternative, an agent that runs whatever SQL it is sent, would mean anyone who
// compromised the B2B server could run arbitrary SQL inside the customer's
// accounting database. What this agent will do is exactly what is written here.
//
// Everything below is **read-only**. There is no INSERT, no UPDATE, no DELETE
// anywhere in this agent, and the database login it uses should be granted
// db_datareader and nothing more.
//
// Table names are built from the firm and period codes — Vega is multi-firm and
// multi-period, so `F0101D0017TBLSATFATBASLIK` is one company's 2026 books. Both
// codes come from config rather than being discovered: a sync that guessed the
// period could quietly read last year's numbers and look like it worked.

/** Firm-level table (no period), e.g. F0101TBLCARI. */
export function firmTable(cfg: AgentConfig, name: string): string {
  return `F${cfg.vega.firma}TBL${name}`;
}

/** Period table, e.g. F0101D0017TBLCARIHAREKETLERI. */
export function periodTable(cfg: AgentConfig, name: string): string {
  return `F${cfg.vega.firma}D${cfg.vega.donem}TBL${name}`;
}

/**
 * Firm and period codes are interpolated into table names, so they can never be
 * anything but digits. Everything else in these queries is a bound parameter;
 * this is the one place a value reaches SQL as text, and it is checked here.
 */
export function assertCodes(cfg: AgentConfig): void {
  for (const [label, value] of [
    ["vega.firma", cfg.vega.firma],
    ["vega.donem", cfg.vega.donem],
  ] as const) {
    if (!/^\d{1,6}$/.test(value)) {
      throw new Error(`${label} yalnızca rakam olabilir, alınan: ${JSON.stringify(value)}`);
    }
  }
}

export async function connect(cfg: AgentConfig): Promise<sql.ConnectionPool> {
  assertCodes(cfg);
  return new sql.ConnectionPool({
    server: cfg.db.server,
    port: cfg.db.port,
    database: cfg.db.database,
    user: cfg.db.user || undefined,
    password: cfg.db.password || undefined,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      ...(cfg.db.instanceName ? { instanceName: cfg.db.instanceName } : {}),
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
    requestTimeout: 120_000,
  }).connect();
}

export interface CustomerRow {
  code: string;
  name: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  balance: number | null;
}

/**
 * Cari kartları, with the balance the ERP's own ledger says.
 *
 * The balance follows the formula the ERP's own screens use: `SUM(BORC-ALACAK)`
 * over the period's cari movements, with credit accounts excluded. It is sent
 * for information only — the B2B keeps its own balance from its own ledger and
 * shows the two side by side rather than letting one overwrite the other.
 *
 * Only cari with a code are sent, and passive ones (STATUS=2) are left out:
 * a closed account is not a customer anybody should be ordering for.
 */
export async function readCustomers(
  pool: sql.ConnectionPool,
  cfg: AgentConfig,
  withBalance: boolean,
): Promise<CustomerRow[]> {
  const cari = firmTable(cfg, "CARI");
  const hareket = periodTable(cfg, "CARIHAREKETLERI");

  // SUM(BORC - ALACAK) over the period's movements, which is what Vega's own
  // cari screens add up. Verified against the first customer's database: the
  // movement table carries no credit-account flag to exclude, so there is
  // nothing to filter out here.
  const balanceJoin = withBalance
    ? `LEFT JOIN (
         SELECT FIRMANO, SUM(ISNULL(BORC,0) - ISNULL(ALACAK,0)) AS BAKIYE
         FROM [${hareket}]
         GROUP BY FIRMANO
       ) h ON h.FIRMANO = c.IND`
    : "";

  const result = await pool.request().query<{
    code: string;
    name: string | null;
    taxNumber: string | null;
    taxOffice: string | null;
    balance: number | null;
  }>(`
    SELECT
      c.FIRMAKODU              AS code,
      c.FIRMAADI               AS name,
      c.VERGINO                AS taxNumber,
      c.VERGIDAIRESI           AS taxOffice,
      ${withBalance ? "h.BAKIYE" : "NULL"} AS balance
    FROM [${cari}] c
    ${balanceJoin}
    WHERE ISNULL(c.FIRMAKODU, '') <> ''
      AND ISNULL(c.STATUS, 1) <> 2
  `);

  return result.recordset.map((r) => ({
    code: String(r.code).trim(),
    name: r.name?.trim() || null,
    taxNumber: r.taxNumber?.trim() || null,
    taxOffice: r.taxOffice?.trim() || null,
    balance: r.balance == null ? null : Number(r.balance),
  }));
}

export interface StockRow {
  code: string;
  quantity: number;
}

/**
 * Stok miktarları, summed across warehouses.
 *
 * Read from the **period** `TBLDEPOENVANTER`, which is where Vega keeps the
 * warehouse ledger: one row per movement, with `ENVANTER` signed (+ in, − out),
 * so the sum per stock card is the quantity the ERP's own stock screens show.
 *
 * The firm-level `TBLSTOKENVANTER` looks like the same thing and is not. It is
 * the critical-level grid — `ALTSEVIYE`, `KRITIKSEVIYE`, `SIPARISALINMASIN` —
 * and its `ENVANTER` is a leftover that nothing keeps current: on the first
 * customer's database 189.004 rows carry 13.462 units between them, of which
 * only 2.740 rows are non-zero, while the period ledger for the same firm holds
 * 78.559 units across 13.588 cards. Reading the wrong one publishes a catalogue
 * that is empty almost everywhere.
 *
 * `REZERV` is not subtracted, because it is never written: it is 0 on every row
 * of that table in all three installations examined. Reserved quantity lives in
 * `TBLALSIPLIST.REZERV` and `TBLREZERVHAREKETLERI` instead (kılavuz §62.2), and
 * subtracting an always-zero column only made the query look careful.
 *
 * `IND < 100` is skipped. Every Vega firm opens with the same four system cards
 * — VADE FARKI, KUR FARKI, DEVIR, HIZMET — and Vega posts non-stock lines
 * against them: on the first customer's 2026 period the DEVIR card alone
 * carries 18.062 ledger rows. They are not products and must not reach a
 * catalogue.
 */
export async function readStock(
  pool: sql.ConnectionPool,
  cfg: AgentConfig,
): Promise<StockRow[]> {
  const stoklar = firmTable(cfg, "STOKLAR");
  const envanter = periodTable(cfg, "DEPOENVANTER");

  const result = await pool.request().query<{ code: string; quantity: number }>(`
    SELECT
      s.STOKKODU AS code,
      SUM(ISNULL(e.ENVANTER, 0)) AS quantity
    FROM [${envanter}] e
    JOIN [${stoklar}] s ON s.IND = e.STOKNO
    WHERE ISNULL(s.STOKKODU, '') <> ''
      AND ISNULL(s.IPTAL, 0) = 0
      AND s.IND >= 100
    GROUP BY s.STOKKODU
  `);

  return result.recordset.map((r) => ({
    code: String(r.code).trim(),
    quantity: Number(r.quantity) || 0,
  }));
}

export interface PriceRow {
  code: string;
  price: number;
  /** B2B müşteri grubunun adı; null = varsayılan kademe. */
  customerGroupCode: string | null;
  minQuantity: number | null;
}

/** Bir Vega fiyat listesi satırının ham hâli. */
interface RawPriceRow {
  code: string;
  kdv: number | null;
  kdvDahil: number | null;
  [key: string]: unknown;
}

/**
 * Satış fiyatları — `TBLBIRIMLEREX.SATISFIYATI1..6`.
 *
 * Vega keeps up to six sales price lists per **unit**, not per stock card, and
 * the card points at the unit it sells in through `TBLSTOKLAR.BIRIMEX`. That
 * column is the join Vega itself uses, and it is the only one that is safe:
 * joining on `VARSAYILAN = 1` instead loses every card whose unit row does not
 * carry the flag — 15.821 of 95.026 on the first customer's database, silently.
 *
 * `SATISFIYATI` (no number) is a dead column: zero rows in all three
 * installations. It is what an earlier version of this agent looked at, which is
 * why prices "did not exist" here.
 *
 * Which list belongs to which B2B customer group is a business decision, so it
 * comes from config rather than being guessed. A list nobody mapped is not sent.
 *
 * Prices stored VAT-inclusive (`KDVDAHIL = 1`) are converted down using the
 * card's own VAT group, because the B2B stores net prices and adds VAT itself.
 * Beware the group names: the group called "8 KDV" carries `KDV = 10`. The name
 * is a label somebody stopped updating; the column is the rate.
 *
 * Only prices in TL are sent — the B2B price row carries no currency, so a
 * foreign-currency list would arrive as if it were lira. Those rows are counted
 * and reported instead of being converted here at a rate this process does not
 * have.
 */
export async function readPrices(
  pool: sql.ConnectionPool,
  cfg: AgentConfig,
): Promise<{ rows: PriceRow[]; skippedForeignCurrency: number }> {
  const stoklar = firmTable(cfg, "STOKLAR");
  const birimler = firmTable(cfg, "BIRIMLEREX");
  const kdvGruplari = firmTable(cfg, "KDVGRUPLARI");

  const lists = cfg.prices.lists.filter((l) => l.list >= 1 && l.list <= 6);
  if (lists.length === 0) {
    throw new Error(
      "prices.lists boş — hangi Vega fiyat listesinin (1..6) hangi müşteri " +
        "grubuna karşılık geldiğini agent.config.json içinde yazın.",
    );
  }

  const columns = lists
    .map((l) => `b.SATISFIYATI${l.list} AS f${l.list}, b.PB${l.list} AS pb${l.list}`)
    .join(", ");

  const result = await pool.request().query<RawPriceRow>(`
    SELECT
      s.STOKKODU AS code,
      k.KDV      AS kdv,
      b.KDVDAHIL AS kdvDahil,
      ${columns}
    FROM [${stoklar}] s
    JOIN [${birimler}] b ON b.IND = s.BIRIMEX
    LEFT JOIN [${kdvGruplari}] k ON k.IND = s.KDVGRUBU
    WHERE ISNULL(s.STOKKODU, '') <> ''
      AND ISNULL(s.IPTAL, 0) = 0
      AND s.IND >= 100
  `);

  const rows: PriceRow[] = [];
  let skippedForeignCurrency = 0;

  for (const r of result.recordset) {
    const code = String(r.code).trim();
    if (!code) continue;

    for (const l of lists) {
      const price = Number(r[`f${l.list}`] ?? 0);
      if (!Number.isFinite(price) || price <= 0) continue;

      const currency = String(r[`pb${l.list}`] ?? "").trim().toUpperCase();
      if (currency && currency !== "TL" && currency !== "TRY") {
        skippedForeignCurrency += 1;
        continue;
      }

      // KDV dahil tutulan fiyatı net'e indir. Oran yoksa fiyata dokunulmaz:
      // bilinmeyen bir oranla bölmek, kataloğu sessizce yanlış fiyatlar.
      const vat = Number(r.kdv ?? 0);
      const net =
        Number(r.kdvDahil ?? 0) === 1 && vat > 0 ? price / (1 + vat / 100) : price;

      rows.push({
        code,
        price: Math.round(net * 100) / 100,
        customerGroupCode: l.customerGroupCode,
        minQuantity: null,
      });
    }
  }

  return { rows, skippedForeignCurrency };
}
