import type sql from "mssql";
import type { AgentConfig } from "./config";
import { connect } from "./vega";
import { describeOrderTables } from "./describe-orders";
import { parseWriteOrderPayload, writeOrder } from "./write-order";

// Ajanın kabul ettiği komutların **tamamı**.
//
// The B2B does not send SQL. It sends the *name* of one of the commands below
// and a normalised payload; what runs is the code in this repository, on the
// customer's machine. This is the same boundary the read side has documented
// since day one, kept intact now that traffic also flows inwards:
//
//   B2B  ──"writeOrder" + sipariş satırları──▶  ajan  ──kendi INSERT'i──▶  VegaDB
//
// A name that is not in this table is refused before anything is parsed. So the
// worst an attacker who holds the command token can do is run one of three
// things that are written here, on this ERP, with a payload that is validated
// again on arrival.

export class CommandError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

interface CommandDefinition {
  summary: string;
  /** ERP'ye yazar mı — günlüğe ve `ping` çıktısına giriyor. */
  writes: boolean;
  /** Veritabanı bağlantısı gerekiyor mu. `ping` gerektirmez: tünel testi bu. */
  needsDatabase: boolean;
  run(cfg: AgentConfig, pool: sql.ConnectionPool | null, payload: unknown): Promise<unknown>;
}

const COMMANDS: Record<string, CommandDefinition> = {
  ping: {
    summary: "Ajan ayakta mı, yazma açık mı",
    writes: false,
    needsDatabase: false,
    run: async (cfg) => ({
      agent: "erp-agent",
      erp: "vega",
      firma: cfg.vega.firma,
      donem: cfg.vega.donem,
      writeEnabled: cfg.write.enabled,
      commands: Object.entries(COMMANDS).map(([name, def]) => ({
        name,
        writes: def.writes,
        summary: def.summary,
      })),
    }),
  },

  describeOrderTables: {
    summary: "Sipariş tablolarının gerçek sütunları, serileri ve örnek bir belge",
    writes: false,
    needsDatabase: true,
    run: async (cfg, pool) => describeOrderTables(pool!, cfg),
  },

  writeOrder: {
    summary: "Siparişi ERP'ye alınan sipariş (BELGETIPI 60) olarak yaz",
    writes: true,
    needsDatabase: true,
    run: async (cfg, pool, payload) => writeOrder(pool!, cfg, parseWriteOrderPayload(payload)),
  },
};

export function commandNames(): string[] {
  return Object.keys(COMMANDS);
}

/**
 * Komutlar sırayla çalışır.
 *
 * Two writes at once would each take the same document number from the same
 * lock and one would wait on the other inside a transaction. Serialising here
 * costs nothing — a B2B installation pushes orders one button-press at a time —
 * and removes the whole class of problem.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialise<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  // The chain must survive a failed command: without this, one rejection would
  // make every later command reject with the *previous* command's error.
  queue = result.catch(() => undefined);
  return result;
}

export interface CommandOutcome {
  command: string;
  writes: boolean;
  result: unknown;
  durationMs: number;
}

export async function runCommand(
  cfg: AgentConfig,
  command: unknown,
  payload: unknown,
): Promise<CommandOutcome> {
  const name = typeof command === "string" ? command.trim() : "";
  const definition = Object.prototype.hasOwnProperty.call(COMMANDS, name)
    ? COMMANDS[name]
    : undefined;
  if (!definition) {
    // The list is not secret — it is in this repository — and naming it turns a
    // typo into a fixed typo instead of a support call.
    throw new CommandError(
      `Bilinmeyen komut: ${name || "(boş)"}. Tanımlı olanlar: ${commandNames().join(", ")}`,
      "BILINMEYEN_KOMUT",
      404,
    );
  }

  return serialise(async () => {
    const started = Date.now();
    let pool: sql.ConnectionPool | null = null;
    try {
      if (definition.needsDatabase) pool = await connect(cfg);
      const result = await definition.run(cfg, pool, payload);
      return {
        command: name,
        writes: definition.writes,
        result,
        durationMs: Date.now() - started,
      };
    } finally {
      // One pool per command rather than one kept open all night: the sync path
      // already works this way, and a connection that has been idle since
      // yesterday is the one that fails on the day it matters.
      await pool?.close().catch(() => undefined);
    }
  });
}
