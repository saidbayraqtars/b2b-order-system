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
