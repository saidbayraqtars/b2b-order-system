/** Thin typed fetch helpers. Throw Error(message) with the API's error text. */

async function parse(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

function messageOf(data: unknown, status: number): string {
  if (data && typeof data === "object" && "error" in data) {
    return String((data as { error: unknown }).error);
  }
  return `HTTP ${status}`;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const data = await parse(res);
  if (!res.ok) throw new Error(messageOf(data, res.status));
  return data as T;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await parse(res);
  if (!res.ok) throw new Error(messageOf(data, res.status));
  return data as T;
}
