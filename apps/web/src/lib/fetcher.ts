/** Thin typed fetch helpers. Throw Error(message) with the API's error text. */

async function request<T>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });

  // 204 No Content (deletes) has no body to parse.
  if (res.status === 204) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return undefined as T;
  }

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export function apiGet<T>(url: string): Promise<T> {
  return request<T>(url, "GET");
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, "POST", body);
}

export function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, "PATCH", body);
}

export function apiDelete(url: string): Promise<void> {
  return request<void>(url, "DELETE");
}
