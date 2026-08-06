import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Ajanın yapılandırması.
//
// This runs on the customer's own machine, next to their ERP. It holds two
// credentials — the ERP's database login and the B2B token — and neither may
// end up anywhere but this machine. So the file is read from a path given at
// start-up and is never written back, never uploaded, never logged.

export interface AgentConfig {
  /** Where the B2B installation lives, e.g. https://siparis.musteri.com */
  apiUrl: string;
  /** The bearer token issued in /admin/erp. Shown once, there. */
  token: string;

  db: {
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
    /** Named instance, when the ERP was installed under one. */
    instanceName?: string;
  };

  /**
   * Which company and period inside the ERP.
   *
   * Vega is multi-firm and multi-period, and its table names are built from the
   * two: `F0101D0017TBLSATFATBASLIK`. Both belong in config rather than being
   * discovered — a sync that guessed the period could silently read last year.
   */
  vega: {
    /** Firm code, four digits, e.g. "0101". */
    firma: string;
    /** Period code, four digits, e.g. "0017". */
    donem: string;
  };

  /** Minutes between runs when the agent is left running. */
  intervalMinutes: number;
  /** How many rows go in one request. */
  batchSize: number;
  /** Which syncs this installation wants. */
  sync: {
    customers: boolean;
    stock: boolean;
    prices: boolean;
  };
}

const DEFAULT_PATH = "agent.config.json";

export function loadConfig(argPath?: string): AgentConfig {
  const file = path.resolve(argPath ?? process.env.AGENT_CONFIG ?? DEFAULT_PATH);
  if (!existsSync(file)) {
    throw new Error(
      `Yapılandırma bulunamadı: ${file}\n` +
        `agent.config.example.json dosyasını kopyalayıp doldurun, ya da --config ile yol verin.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} geçerli JSON değil: ${(e as Error).message}`);
  }

  const c = raw as Partial<AgentConfig>;
  const problems: string[] = [];

  if (!c.apiUrl?.trim()) problems.push("apiUrl gerekli");
  if (!c.token?.trim()) problems.push("token gerekli (B2B → Yönetim → ERP'den alınır)");
  if (!c.db?.server?.trim()) problems.push("db.server gerekli");
  if (!c.db?.database?.trim()) problems.push("db.database gerekli");
  if (!c.vega?.firma?.trim()) problems.push("vega.firma gerekli (örn. 0101)");
  if (!c.vega?.donem?.trim()) problems.push("vega.donem gerekli (örn. 0017)");

  // Every complaint at once — the same courtesy tenant.json gets. A half-filled
  // file should take one edit to fix, not one round trip per field.
  if (problems.length > 0) {
    throw new Error(`${file} eksik:\n${problems.map((p) => `  · ${p}`).join("\n")}`);
  }

  return {
    apiUrl: c.apiUrl!.trim().replace(/\/+$/, ""),
    token: c.token!.trim(),
    db: {
      server: c.db!.server!.trim(),
      port: c.db!.port ?? 1433,
      database: c.db!.database!.trim(),
      user: c.db!.user ?? "",
      password: c.db!.password ?? "",
      instanceName: c.db!.instanceName,
    },
    vega: { firma: c.vega!.firma!.trim(), donem: c.vega!.donem!.trim() },
    intervalMinutes: c.intervalMinutes ?? 30,
    batchSize: Math.min(c.batchSize ?? 1000, 5000),
    sync: {
      customers: c.sync?.customers ?? true,
      stock: c.sync?.stock ?? true,
      prices: c.sync?.prices ?? false,
    },
  };
}
