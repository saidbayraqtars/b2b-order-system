module.exports = {
  root: true,
  extends: ["@repo/eslint-config/base"],
  overrides: [
    {
      // The seeds are CLI scripts: printing what they did is the point.
      files: ["prisma/seed.ts", "prisma/seed-demo.ts"],
      rules: { "no-console": "off" },
    },
  ],
};
