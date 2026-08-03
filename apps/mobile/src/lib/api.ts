// Typed fetch wrapper for the mobile app. Talks to the Next.js API in apps/web.
// Base URL comes from EXPO_PUBLIC_API_URL (set in .env / EAS env).

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Domain error code from the API (BusinessError.code), when present. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
};

/**
 * Called when the server rejects our bearer token — the account was
 * deactivated, its role changed, or its password was reset. The token is
 * signed and unexpired, so nothing on the device can detect this; only the
 * server can, and it tells us with a 401. The auth store registers a handler
 * that drops the token and returns the app to the login screen.
 */
type SessionExpiredHandler = (reason: string) => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(fn: SessionExpiredHandler | null): void {
  onSessionExpired = fn;
}

/** 401 codes that mean "this token will never work again" — see apps/web guard. */
const DEAD_SESSION_CODES = new Set([
  "SESSION_REVOKED",
  "ACCOUNT_DISABLED",
  "ACCOUNT_MISSING",
  "NO_SESSION",
]);

export async function apiFetch<T>(
  path: string,
  { method = "GET", body, token }: RequestOptions = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data.error) message = data.error;
      code = data.code;
    } catch {
      // non-JSON error body; keep default message
    }

    // Only for requests that actually carried a token: a 401 from the login
    // endpoint is a wrong password, not a dead session.
    if (res.status === 401 && token && DEAD_SESSION_CODES.has(code ?? "")) {
      onSessionExpired?.(code ?? "SESSION_REVOKED");
    }

    throw new ApiError(res.status, message, code);
  }

  return (await res.json()) as T;
}

/** Build a query string, skipping null/undefined/empty values. */
export function qs(params: Record<string, string | undefined | null>): string {
  const entries = Object.entries(params).filter(
    (e): e is [string, string] => !!e[1],
  );
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
}
