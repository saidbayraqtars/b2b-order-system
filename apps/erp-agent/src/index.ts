import sql from "mssql";
import { loadConfig, type AgentConfig } from "./config";
import { connect, readCustomers, readPrices, readStock, readUnits } from "./vega";
import { startCommandServer } from "./server";

// ERP ajanı — müşterinin makinesinde çalışır.
//
//   ERP (VegaDB)  ──oku──▶  ajan  ──HTTPS──▶  B2B
//
// The sync above is push-only: it reads the ERP and posts normalised rows, and
// what it reads is decided by the config file on this machine.
//
// Sipariş yazma yönü açıldığında ikinci bir yol daha var:
//
//   B2B  ──HTTPS──▶  Cloudflare Tunnel  ──▶  cloudflared  ──▶  bu süreç  ──▶  VegaDB
//
// The B2B never sends SQL down it. It names one of the commands in
// `commands.ts` and the agent runs its own code — so compromising the B2B
// server still does not turn into arbitrary SQL against a customer's accounting
// database. The channel is off until `command.enabled`, and writing is off
// again separately until `write.enabled`.
//
//   erp-agent --once     bir kez eşitle, çık (zamanlanmış görev için)
//   erp-agent            sürekli çalış: eşitleme döngüsü + komut kanalı
//   erp-agent --serve    yalnızca komut kanalı (eşitleme zamanlanmış görevdeyse)
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

    // Birimler fiyattan önce: paket fiyatı, sunucuda o paket birimine bağlanıyor.
    if (cfg.sync.units) {
      const units = await readUnits(pool, cfg);
      await sendBatched(cfg, "units", units, "Paket birimi");
    }

    if (cfg.sync.prices) {
      const { rows, skippedForeignCurrency } = await readPrices(pool, cfg);
      if (skippedForeignCurrency > 0) {
        // Not an error: the ERP is allowed to keep a foreign-currency list. It
        // is said out loud because a silently shorter catalogue is the kind of
        // thing nobody notices until a customer sees no price.
        log(
          `Fiyat: ${skippedForeignCurrency} satır TL dışı para biriminde, gönderilmedi`,
        );
      }
      await sendBatched(cfg, "prices", rows, "Fiyat");
    }
  } finally {
    await pool?.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const once = argv.includes("--once");
  const serveOnly = argv.includes("--serve");
  const configIndex = argv.indexOf("--config");
  const configPath = configIndex >= 0 ? argv[configIndex + 1] : undefined;

  const cfg = loadConfig(configPath);

  if (once) {
    await runOnce(cfg);
    return;
  }

  const server = startCommandServer({ cfg, log });
  if (serveOnly) {
    if (!server) {
      throw new Error(
        "--serve verildi ama command.enabled kapalı. agent.config.json içinde komut kanalını açın.",
      );
    }
    // Nothing else to do: the listener holds the process open.
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
