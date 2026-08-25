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

  /**
   * Host'tan gelen komutları dinleyen yerel uç (Cloudflare Tunnel'ın iç ucu).
   *
   * Off by default. When it is on the agent listens on **127.0.0.1** and
   * `cloudflared` is what reaches it: nothing is published to the internet by
   * this process, and no port is opened on the customer's router. Binding it to
   * anything but loopback is possible and is warned about at start-up — the
   * tunnel exists so that it never has to be.
   */
  command: {
    enabled: boolean;
    host: string;
    port: number;
    /** Host'un sunacağı taşıyıcı token. B2B tarafında ERP_AGENT_TOKEN. */
    token: string;
  };

  /**
   * ERP'ye yazma kilidi — kılavuz §43.1'in birinci katmanı.
   *
   * False in the shipped config, and it is the first thing every write checks.
   * The other two layers are not in this file: the database login stays
   * `db_datareader` until an operator grants more, and the B2B will not send a
   * write until a human with `erp.push` presses the button on an approved
   * order.
   */
  write: {
    enabled: boolean;
    /**
     * Kendi belge serimizin öneki. Vega'nın kullandığı seriyi **sürdürmeyin**
     * (kılavuz §21.4, §46.3): aynı seriyi paylaşmak Vega'nın kendi
     * muhasebeleştirmesiyle çakışıyor.
     */
    orderPrefix: string;
    /**
     * Sipariş başlığında b2b sipariş numarasının yazılacağı sütun.
     *
     * This is what makes a second push of the same order find the first one
     * instead of writing it twice. If the column is not on this installation's
     * table the write refuses rather than silently dropping the marker —
     * `describeOrderTables` lists what is really there.
     */
    referenceColumn: string;
    /** Satırların deposu (`HAREKETDEPOSU` / satırdaki `DEPO`). */
    depo: number;
    /** Başlıktaki `USERNO`. Gerçek kayıtlarda 100 görüldü (kılavuz §22.8). */
    userNo: number;
    /** `OZELKOD1` = şube, `OZELKOD2` = kasa (kılavuz §22.6). */
    branch: string;
    till: string;
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

  // The command channel is the one inbound door this process has, so its
  // credential is checked here rather than at the first request: an agent that
  // came up listening with a four-character token would be a hole nobody looked
  // at again.
  if (c.command?.enabled) {
    if ((c.command.token ?? "").trim().length < 32) {
      problems.push(
        "command.token en az 32 karakter olmalı (B2B tarafındaki ERP_AGENT_TOKEN ile aynı). " +
          "Üretmek için: openssl rand -base64 33",
      );
    }
    if (c.write?.enabled && !/^[A-Z]{1,3}$/.test((c.write.orderPrefix ?? "B").trim() || "B")) {
      problems.push('write.orderPrefix yalnızca 1-3 büyük harf olabilir (örn. "B")');
    }
  } else if (c.write?.enabled) {
    problems.push(
      "write.enabled açık ama command.enabled kapalı — yazma yalnızca komut kanalından gelir.",
    );
  }

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
    command: {
      enabled: c.command?.enabled ?? false,
      host: c.command?.host?.trim() || "127.0.0.1",
      port: c.command?.port ?? 8787,
      token: c.command?.token?.trim() ?? "",
    },
    write: {
      enabled: c.write?.enabled ?? false,
      orderPrefix: c.write?.orderPrefix?.trim() || "B",
      referenceColumn: c.write?.referenceColumn?.trim() || "OZELKOD3",
      depo: c.write?.depo ?? 1,
      userNo: c.write?.userNo ?? 100,
      branch: c.write?.branch?.trim() || "MERKEZ",
      till: c.write?.till?.trim() || "MERKEZ",
    },
    intervalMinutes: c.intervalMinutes ?? 30,
    batchSize: Math.min(c.batchSize ?? 1000, 5000),
    sync: {
      customers: c.sync?.customers ?? true,
      stock: c.sync?.stock ?? true,
      prices: c.sync?.prices ?? false,
    },
  };
}
