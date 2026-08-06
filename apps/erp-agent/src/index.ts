import sql from "mssql";
import { loadConfig, type AgentConfig } from "./config";
import { connect, readCustomers, readStock } from "./vega";

// ERP ajanı — müşterinin makinesinde çalışır.
//
//   ERP (VegaDB)  ──oku──▶  ajan  ──HTTPS──▶  B2B
//
// It only ever reads the ERP and only ever posts normalised rows. It never
// writes to the ERP, and it never receives instructions from the B2B: the sync
// it runs is decided by the config file on this machine, so compromising the
// B2B server does not turn into code execution against the customer's
// accounting database.
//
//   erp-agent --once     bir kez çalış, çık (zamanlanmış görev için)
//   erp-agent            sürekli çalış, intervalMinutes'ta bir tekrarla
//   erp-agent --config X başka bir yapılandırma dosyası

interface IngestResponse {
  runId: string;
  received: number;
  applied: number;
  skipped: number;
  status: string;
}

/** Post one batch, with the agent token. Throws on anything but 2xx. */
async function post(
  cfg: AgentConfig,
  route: string,
  rows: unknown[],
): Promise<IngestResponse> {
  const res = await fetch(`${cfg.apiUrl}/api/erp/${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({ rows }),
  });

  const text = await res.text();
  if (!res.ok) {
    // The token never goes into the message: this log ends up in a customer's
    // scheduled-task output, which is not a place for a credential.
    throw new Error(`POST /api/erp/${route} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as IngestResponse;
}

/** Send in batches, because one body of 80.000 cari helps nobody. */
async function sendBatched(
  cfg: AgentConfig,
  route: string,
  rows: unknown[],
  label: string,
): Promise<void> {
  if (rows.length === 0) {
    log(`${label}: gönderilecek satır yok`);
    return;
  }

  let applied = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += cfg.batchSize) {
    const batch = rows.slice(i, i + cfg.batchSize);
    const result = await post(cfg, route, batch);
    applied += result.applied;
    skipped += result.skipped;
  }
  log(`${label}: ${rows.length} okundu, ${applied} uygulandı, ${skipped} eşleşmedi`);
}

function log(message: string): void {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

async function runOnce(cfg: AgentConfig): Promise<void> {
  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await connect(cfg);
    log(`ERP'ye bağlandı: ${cfg.db.server}/${cfg.db.database} (F${cfg.vega.firma} D${cfg.vega.donem})`);

    if (cfg.sync.customers) {
      const customers = await readCustomers(pool, cfg, true);
      await sendBatched(cfg, "customers", customers, "Cari");
    }

    if (cfg.sync.stock) {
      const stock = await readStock(pool, cfg);
      await sendBatched(cfg, "stock", stock, "Stok");
    }

    if (cfg.sync.prices) {
      // readPrices throws with an explanation: the sales price source is
      // firm-specific and has to be written for this installation before it can
      // be trusted to reprice anything.
      const { readPrices } = await import("./vega");
      readPrices();
    }
  } finally {
    await pool?.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const once = argv.includes("--once");
  const configIndex = argv.indexOf("--config");
  const configPath = configIndex >= 0 ? argv[configIndex + 1] : undefined;

  const cfg = loadConfig(configPath);

  if (once) {
    await runOnce(cfg);
    return;
  }

  log(`Ajan başladı — her ${cfg.intervalMinutes} dakikada bir eşitlenecek`);
  for (;;) {
    try {
      await runOnce(cfg);
    } catch (e) {
      // A failed run must not stop the agent: the ERP may simply have been
      // restarting, and an agent that exited would stay dead until someone
      // noticed. The B2B side already recorded the failure.
      log(`HATA: ${e instanceof Error ? e.message : String(e)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, cfg.intervalMinutes * 60_000));
  }
}

main().catch((e: unknown) => {
  log(`ÖLÜMCÜL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
