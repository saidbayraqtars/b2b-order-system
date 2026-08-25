import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AgentConfig } from "./config";
import { CommandError, commandNames, runCommand } from "./commands";

// Komut kanalı — host'un ajana ulaştığı tek kapı.
//
//   B2B  ──HTTPS──▶  Cloudflare Tunnel  ──▶  cloudflared (bu makinede)  ──▶  127.0.0.1:8787
//
// The listener binds loopback. Nothing is published to the internet by this
// process, no port is opened on the customer's router, and the tunnel is what
// gives the B2B a stable address to reach. That is the entire reason a tunnel
// is here rather than a port forward.
//
// The token is the gate. It is checked in constant time, before the body is
// read, and it is never written to a log — this output ends up in a customer's
// scheduled-task window.

const MAX_BODY_BYTES = 1_000_000;

interface Deps {
  cfg: AgentConfig;
  log: (message: string) => void;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    // Nothing here is for a browser, and a page that could reach this would be
    // a page that could write to an ERP.
    "X-Content-Type-Options": "nosniff",
  });
  res.end(text);
}

/**
 * Taşıyıcı token doğrulaması.
 *
 * Both sides are hashed before comparing so the comparison is over equal-length
 * buffers — `timingSafeEqual` throws on a length mismatch, and refusing early
 * on length is itself a signal.
 */
function authorised(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? "";
  const [scheme, ...rest] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return false;
  const provided = rest.join(" ").trim();
  if (!provided) return false;

  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new CommandError("İstek gövdesi çok büyük", "GOVDE_BUYUK", 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function errorBody(e: unknown): { status: number; code: string; message: string } {
  if (e instanceof CommandError) {
    return { status: e.status, code: e.code, message: e.message };
  }
  const code = (e as { code?: unknown }).code;
  return {
    status: 400,
    code: typeof code === "string" ? code : "HATA",
    message: e instanceof Error ? e.message : String(e),
  };
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: Deps): Promise<void> {
  const url = new URL(req.url ?? "/", "http://agent.local");

  // Sağlık ucu kimlik istemez ve **hiçbir şey anlatmaz**: tünelin ayakta olup
  // olmadığını söylemesi yeter, ERP'nin durumunu değil.
  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (!authorised(req, deps.cfg.command.token)) {
    // Same answer for missing, malformed and wrong — the read side's tokens are
    // refused this way too.
    json(res, 401, { ok: false, code: "YETKISIZ", message: "Yetkisiz" });
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/command") {
    json(res, 404, {
      ok: false,
      code: "YOL_YOK",
      message: `POST /command bekleniyor. Komutlar: ${commandNames().join(", ")}`,
    });
    return;
  }

  let body: { command?: unknown; payload?: unknown; requestId?: unknown };
  try {
    body = JSON.parse(await readBody(req)) as typeof body;
  } catch (e) {
    const { status, code, message } = errorBody(e);
    json(res, status === 400 ? 400 : status, { ok: false, code, message });
    return;
  }

  const requestId = typeof body.requestId === "string" ? body.requestId.slice(0, 60) : null;

  try {
    const outcome = await runCommand(deps.cfg, body.command, body.payload);
    deps.log(
      `komut ${outcome.command}${requestId ? ` (${requestId})` : ""} → tamam, ${outcome.durationMs} ms`,
    );
    json(res, 200, { ok: true, requestId, ...outcome });
  } catch (e) {
    const { status, code, message } = errorBody(e);
    // The message is logged because it is the thing the operator needs — an
    // unmatched stock code, a missing column, the write lock still on.
    deps.log(
      `komut ${String(body.command)}${requestId ? ` (${requestId})` : ""} → HATA ${code}: ${message}`,
    );
    json(res, status, { ok: false, requestId, code, message });
  }
}

/** Komut sunucusunu başlatır. `command.enabled` kapalıysa hiç açılmaz. */
export function startCommandServer(deps: Deps): Server | null {
  const { cfg, log } = deps;
  if (!cfg.command.enabled) return null;

  const server = createServer((req, res) => {
    void handle(req, res, deps).catch((e: unknown) => {
      log(`komut sunucusu hatası: ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent) json(res, 500, { ok: false, code: "SUNUCU_HATASI" });
    });
  });

  // A request that never finishes must not hold the write queue: everything
  // behind it would wait for a socket nobody is listening on any more.
  server.requestTimeout = 120_000;
  server.headersTimeout = 20_000;

  server.listen(cfg.command.port, cfg.command.host, () => {
    log(`Komut kanalı dinlemede: ${cfg.command.host}:${cfg.command.port}`);
    if (cfg.command.host !== "127.0.0.1" && cfg.command.host !== "localhost") {
      // Not refused — an operator may have a reason — but said out loud, since
      // the tunnel exists precisely so this never has to be reachable directly.
      log(
        `UYARI: komut kanalı ${cfg.command.host} adresine bağlandı. Cloudflare Tunnel ` +
          `kullanıldığında 127.0.0.1 yeterlidir; başka bir adres ERP'yi ağa açar.`,
      );
    }
    log(
      cfg.write.enabled
        ? "UYARI: ERP'ye yazma AÇIK (write.enabled). Sipariş yazma komutu çalışabilir."
        : "ERP'ye yazma kapalı (write.enabled=false) — yazma komutları reddedilir.",
    );
  });

  return server;
}
