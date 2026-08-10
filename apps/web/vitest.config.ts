import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Route-handler suite. Until now every automated test lived in
// `packages/services`: the domain maths was covered and the 119 route handlers
// that expose it were not, so a broken authorization boundary could only be
// found by hand. These tests call the exported GET/POST/PATCH functions
// directly — the same functions Next.js calls — against a real Postgres.
//
// Only two things are faked (see test/setup.ts): `next/headers`, which needs a
// request scope Next.js normally provides, and the Auth.js cookie session.
// The guard, the permission check, Prisma and every service stay real.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Fixtures share tables (companies, orders, the audit trail); two files
    // writing at once would let one suite's counters drift under another's feet.
    //
    // The same clash exists one level up: `turbo run test` would otherwise run
    // this package and @repo/services at the same time, against the one
    // database, and both take order numbers from the same DocumentSeries
    // counter row. `web#test` therefore waits for `@repo/services#test` in
    // turbo.json — the pair failed roughly one run in two before that.
    fileParallelism: false,
    server: {
      // Workspace packages are TypeScript source, not built output. Without
      // this they are handed to Node unchanged and fail on the first `import
      // type`.
      deps: { inline: [/@repo\//] },
    },
  },
});
