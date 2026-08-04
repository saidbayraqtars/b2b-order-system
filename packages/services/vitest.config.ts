import { defineConfig } from "vitest/config";

// Two suites, deliberately separated:
//  - src/**/*.test.ts        pure domain maths, no database, runs anywhere
//  - test/integration/*.ts   real Prisma against a real Postgres; skipped when
//                            DATABASE_URL is absent so `pnpm test` still works
//                            on a machine with no database.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./test/setup-env.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The integration suite writes to shared tables; running files in parallel
    // would let two fixtures fight over the same promotion quota.
    fileParallelism: false,
  },
});
