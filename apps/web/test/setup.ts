import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi } from "vitest";
import { currentScope } from "./request-context";

// ─────────────────────────────────────────────
// environment
// ─────────────────────────────────────────────

// Vitest runs from apps/web, where there is no .env — Prisma only picks one up
// next to the schema. Same reader as packages/services/test/setup-env.ts: read
// the database package's file unless the variable is already set (CI sets it
// directly, so nothing is overwritten there).
if (!process.env.DATABASE_URL) {
  const envPath = resolve(__dirname, "../../../packages/database/.env");
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

// ─────────────────────────────────────────────
// what Next.js normally supplies
// ─────────────────────────────────────────────

// `headers()` outside a Next.js request throws. The guard reads the bearer
// token and the audit trail reads the IP through it, so the scope opened by
// callRoute() stands in for the one the framework would have opened.
vi.mock("next/headers", () => ({
  headers: () => currentScope().headers,
  cookies: () => {
    throw new Error("cookies() yol testlerinde yok; oturum için session verin.");
  },
}));

// `cache` ships in React's canary channel, which Next.js bundles for the app
// router; the workspace is pinned to react 18.2.0, where it does not exist, so
// importing the guard would fail on its first line. The identity version only
// costs the per-request de-duplication — every call still resolves the same
// live account, just without sharing one query.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});

// Auth.js needs a running Next.js server to read a cookie. The mock returns
// whatever the test put in the request scope, which is what makes it possible
// to hand a route a session claiming SUPER_ADMIN and watch the guard answer
// from the database row instead. Bearer-token calls never reach it: the real
// verifyMobileToken checks a real signature.
vi.mock("@/auth", () => ({
  auth: async () => currentScope().session,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));
