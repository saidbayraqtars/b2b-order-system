import * as SecureStore from "expo-secure-store";

// Which server this installation talks to.
//
// It used to be `EXPO_PUBLIC_API_URL`, read once at bundle time. That is fine
// for a build made per customer, and useless for the phone in your pocket: the
// address behind a home connection changes, a tunnel hands out a new hostname
// every time it restarts, and neither is worth rebuilding an APK for. So the
// address lives on the device, editable from the login screen, and the
// compile-time value is only the starting suggestion.

const URL_KEY = "b2b.server.url";

/** What the build was made with — the default until someone changes it. */
export const BUILT_IN_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000"
).replace(/\/+$/, "");

let current = BUILT_IN_URL;

/**
 * Accept what a person would actually type.
 *
 * "192.168.1.40:3000" is a perfectly clear answer to "which server" and fails
 * as a URL, so a missing scheme is filled in rather than rejected. Everything
 * else that cannot be parsed is refused with a message, because a silently
 * broken address looks exactly like a server that is down.
 */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("Sunucu adresi boş olamaz");

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Adres anlaşılamadı (örnek: 192.168.1.40:3000)");
  }
  if (!parsed.hostname) throw new Error("Adres anlaşılamadı");

  // Path, query and hash are dropped: every call appends its own /api/... path,
  // and a pasted address ending in /login would break all of them at once.
  return `${parsed.protocol}//${parsed.host}`;
}

/** Cold start: read the saved address before the first request goes out. */
export async function loadServerUrl(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(URL_KEY);
    if (stored) current = stored;
  } catch {
    // Keychain unavailable — the built-in default still works.
  }
  return current;
}

export async function setServerUrl(input: string): Promise<string> {
  const url = normalizeServerUrl(input);
  current = url;
  await SecureStore.setItemAsync(URL_KEY, url);
  return url;
}

/** Back to whatever the build shipped with. */
export async function resetServerUrl(): Promise<string> {
  current = BUILT_IN_URL;
  await SecureStore.deleteItemAsync(URL_KEY);
  return current;
}

/** Read synchronously — every request does this, so it cannot be async. */
export function serverUrl(): string {
  return current;
}

interface HealthBody {
  status?: string;
  checks?: Record<string, boolean>;
}

export type ServerProbe =
  | { ok: true; url: string; warning?: string }
  | { ok: false; url: string; message: string };

/**
 * Is anything answering there, and is it ours?
 *
 * Worth a round trip before saving: the usual mistake is a stale IP, and the
 * difference between "wrong address" and "server down" is the difference
 * between fixing it in ten seconds and calling for help.
 *
 * `/api/health` answers **503** when any of its checks fails — a missing tenant
 * file, an unwritable upload directory. That is a real fault but not this
 * screen's business, and refusing the address over it would stop someone
 * pointing the app at a working development server. So the question asked here
 * is only "does a B2B server live at this address", answered by the shape of
 * the body; a degraded one is accepted and reported.
 */
export async function probeServer(
  input: string,
  timeoutMs = 5_000,
): Promise<ServerProbe> {
  let url: string;
  try {
    url = normalizeServerUrl(input);
  } catch (err) {
    return { ok: false, url: input, message: (err as Error).message };
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/health`, { signal: abort.signal });

    let body: HealthBody | null = null;
    try {
      body = (await res.json()) as HealthBody;
    } catch {
      // Something answered, but not with JSON — a router login page, say.
      body = null;
    }

    if (!body || typeof body !== "object" || !body.checks) {
      return {
        ok: false,
        url,
        message: res.ok
          ? "Bu adreste B2B sunucusu yok"
          : `Bu adres B2B sunucusu değil (HTTP ${res.status})`,
      };
    }

    if (body.status === "ok") return { ok: true, url };

    const failed = Object.entries(body.checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    return {
      ok: true,
      url,
      warning: `Sunucuya ulaşıldı ama sorun bildiriyor (${failed.join(", ")})`,
    };
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      url,
      message: aborted
        ? "Sunucu cevap vermedi (zaman aşımı)"
        : "Sunucuya ulaşılamadı — adresi ve ağı kontrol edin",
    };
  } finally {
    clearTimeout(timer);
  }
}
