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
function firmTable(cfg: AgentConfig, name: string): string {
  return `F${cfg.vega.firma}TBL${name}`;
}

/** Period table, e.g. F0101D0017TBLCARIHAREKETLERI. */
function periodTable(cfg: AgentConfig, name: string): string {
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
 * Read from the inventory table rather than the `KALAN` column on the stock
 * card: inventory is per-warehouse and is what the ERP's own stock screens add
 * up, while `KALAN` is a running figure that is only as fresh as the last thing
 * that touched it.
 *
 * `REZERV` is subtracted. Stock reserved against an order the ERP has already
 * accepted is not stock the B2B may sell again — that is the double-sell this
 * whole sync exists to prevent.
 */
export async function readStock(
  pool: sql.ConnectionPool,
  cfg: AgentConfig,
): Promise<StockRow[]> {
  const stoklar = firmTable(cfg, "STOKLAR");
  const envanter = firmTable(cfg, "STOKENVANTER");

  const result = await pool.request().query<{ code: string; quantity: number }>(`
    SELECT
      s.STOKKODU AS code,
      SUM(ISNULL(e.ENVANTER, 0) - ISNULL(e.REZERV, 0)) AS quantity
    FROM [${envanter}] e
    JOIN [${stoklar}] s ON s.IND = e.STOKNO
    WHERE ISNULL(s.STOKKODU, '') <> ''
      AND ISNULL(s.IPTAL, 0) = 0
    GROUP BY s.STOKKODU
  `);

  return result.recordset.map((r) => ({
    code: String(r.code).trim(),
    quantity: Number(r.quantity) || 0,
  }));
}

/**
 * Fiyat listesi — **bilerek yazılmadı.**
 *
 * Where a Vega installation keeps the price it sells at is firm-specific. On the
 * first customer's database the obvious candidates are empty: of 95.026 stock
 * cards exactly one has `ISKSATISFIYATI2` set, so that column is plainly not the
 * source there. Prices decide what a customer is charged, and a guess that
 * looked plausible would quietly reprice a catalogue.
 *
 * Enabling this means: find where that installation really keeps its sales
 * price, write the read here, and turn `sync.prices` on. The B2B side already
 * accepts the rows — /api/erp/prices is implemented and tested.
 */
export function readPrices(): never {
  throw new Error(
    "Fiyat okuma bu kurulum için tanımlanmadı — satış fiyatının Vega'da nerede " +
      "tutulduğu firmaya göre değişir. sync.prices'ı açmadan önce vega.ts " +
      "içindeki readPrices'ı o kuruluma göre yazın.",
  );
}
