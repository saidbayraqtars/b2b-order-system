// Web app: the base rules plus Next's own (which brings React + a11y + the
// App Router checks). `next/core-web-vitals` is the stricter of the two presets.
module.exports = {
  extends: [require.resolve("./base.js"), "next/core-web-vitals"],
  settings: { next: { rootDir: __dirname } },
};
