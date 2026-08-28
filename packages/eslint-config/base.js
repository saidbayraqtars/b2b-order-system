// Shared ESLint base for every workspace package.
//
// Deliberately NOT type-aware: type errors are already caught by `pnpm typecheck`,
// and a type-aware lint would need the generated Prisma client before it could run.
// What is left here is the class of mistake tsc does not report — unused code,
// floating promises we can detect syntactically, accidental `any`, console noise.
module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  env: { es2022: true, node: true },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".next/",
    "coverage/",
    "*.config.js",
    "*.config.cjs",
    // Bir dosya kopyalama kazasının bıraktığı kopyalar: `admin (1).ts`,
    // `seed (2).ts` gibi. Kaynak değiller ve depoda izlenmiyorlar, ama derleme
    // ve lint onları bulup **eski** bir sürümün hatalarını rapor ediyor.
    // Aynı desen tsconfig'lerin `exclude` listesinde de var.
    "* (*).ts",
    "* (*).tsx",
  ],
  rules: {
    // An unused parameter named _foo is intentional (interface conformance).
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // `any` erases the guarantees the rest of the codebase relies on. Where it is
    // genuinely needed (heterogeneous registry maps) it is disabled inline with a
    // reason next to it.
    "@typescript-eslint/no-explicit-any": "error",
    // console.error is how failed audit writes and skipped promotions surface.
    "no-console": ["warn", { allow: ["warn", "error"] }],
    eqeqeq: ["error", "always", { null: "ignore" }],
    "prefer-const": "error",
    "no-var": "error",
  },
};
