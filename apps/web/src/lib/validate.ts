import type { z } from "zod";
import { InputError } from "./guard";

/**
 * Parse a JSON request body against a Zod schema.
 * A malformed body or a failed check becomes InputError → HTTP 400 with the
 * first validation message, so route handlers stay free of parse boilerplate.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
  }
  return parsed.data;
}
