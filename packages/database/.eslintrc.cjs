module.exports = {
  root: true,
  extends: ["@repo/eslint-config/base"],
  overrides: [
    {
      // The seed is a CLI script: printing what it did is the point.
      files: ["prisma/seed.ts"],
      rules: { "no-console": "off" },
    },
  ],
};
