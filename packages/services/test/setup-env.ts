import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Vitest runs from packages/services, where there is no .env — Prisma only picks
// one up next to the schema. Rather than duplicate the connection string, read
// the database package's file when the variable is not already in the
// environment (CI sets it directly, so nothing is overwritten there).
if (!process.env.DATABASE_URL) {
  const envPath = resolve(__dirname, "../../database/.env");
  if (existsSync(envPath)) {
    for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}
