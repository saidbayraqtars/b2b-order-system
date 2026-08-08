import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { channels, toHex } from "./color";
import { radiusPixelVars, themeStyleSheet, themeVars } from "./css";
import { FALLBACK_PACK, THEME_PACKS, findPack, resolveTheme } from "./registry";
import { COLOR_KEYS, colorsOf, schemesOf } from "./tokens";

// The Tailwind mapping is plain CommonJS on purpose (mobile's config is loaded
// by bare Node). This is the seam where it can drift from the token list, so
// the seam is what gets tested.
const require = createRequire(import.meta.url);
const { themeExtension } = require("../tailwind.cjs") as {
  themeExtension: (o?: { web?: boolean }) => { colors: Record<string, string> };
};

describe("channels", () => {
  it("expands short hex", () => {
    expect(channels("#fff")).toBe("255 255 255");
  });

  it("splits into sRGB channels", () => {
    expect(channels("#ff2d78")).toBe("255 45 120");
  });

  it("rejects anything that is not a colour", () => {
    expect(() => channels("neon pink")).toThrow();
  });

  it("round-trips through hex for the native views that need it", () => {
    expect(toHex(channels("#ff2d78"))).toBe("#ff2d78");
    expect(toHex(channels("#0a0a12"))).toBe("#0a0a12");
    expect(() => toHex("255 45")).toThrow();
  });
});

describe("packs", () => {
  it("have unique ids", () => {
    const ids = THEME_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ship the scheme they declare as default", () => {
    for (const pack of THEME_PACKS) {
      expect(schemesOf(pack), pack.id).toContain(pack.defaultScheme);
    }
  });

  it("define every colour in every scheme they ship", () => {
    for (const pack of THEME_PACKS) {
      for (const scheme of schemesOf(pack)) {
        const colors = colorsOf(pack, scheme);
        for (const key of COLOR_KEYS) {
          expect(colors[key], `${pack.id}/${scheme}/${key}`).toMatch(/^\d+ \d+ \d+$/);
        }
      }
    }
  });
});

describe("tailwind mapping", () => {
  it("exposes a utility for every colour token", () => {
    const colors = themeExtension().colors;
    for (const key of COLOR_KEYS) {
      const utility = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      expect(colors[utility], `tailwind.cjs eksik: ${utility}`).toBe(
        `rgb(var(--c-${utility}) / <alpha-value>)`,
      );
    }
  });

  it("adds no colour the packs do not define", () => {
    const declared = new Set(
      COLOR_KEYS.map((k) => k.replace(/([A-Z])/g, "-$1").toLowerCase()),
    );
    for (const utility of Object.keys(themeExtension().colors)) {
      expect(declared.has(utility), `pakette karşılığı yok: ${utility}`).toBe(true);
    }
  });

  it("keeps shadow and grid utilities off React Native", () => {
    expect(themeExtension()).not.toHaveProperty("boxShadow");
    expect(themeExtension({ web: true })).toHaveProperty("boxShadow");
  });
});

describe("radiusPixelVars", () => {
  // Android casts borderRadius to a double. A "0.25rem" string there is not a
  // wrong corner, it is a crashed screen.
  it("returns numbers, never strings", () => {
    for (const pack of THEME_PACKS) {
      for (const value of Object.values(radiusPixelVars(pack.radii))) {
        expect(typeof value, pack.id).toBe("number");
      }
    }
  });

  it("converts rem against a 16px root and passes px through", () => {
    const vars = radiusPixelVars({
      sm: "0.125rem",
      md: "0.5rem",
      lg: "12px",
      xl: "1rem",
      pill: "9999px",
    });
    expect(vars["--radius-sm"]).toBe(2);
    expect(vars["--radius-md"]).toBe(8);
    expect(vars["--radius-lg"]).toBe(12);
    expect(vars["--radius-xl"]).toBe(16);
    expect(vars["--radius-pill"]).toBe(9999);
  });
});

describe("resolveTheme", () => {
  it("falls back when the id is unknown", () => {
    expect(findPack("silinmis-paket").id).toBe(FALLBACK_PACK.id);
    expect(findPack(undefined).id).toBe(FALLBACK_PACK.id);
  });

  it("refuses to invent a scheme a pack does not ship", () => {
    // NEO-MART is dark only. Asking for light must give its dark, not another
    // pack's light — a half-applied identity is worse than no switch.
    const { pack, scheme } = resolveTheme("neo-mart", "light");
    expect(pack.id).toBe("neo-mart");
    expect(scheme).toBe("dark");
  });

  it("honours a scheme the pack does ship", () => {
    expect(resolveTheme(FALLBACK_PACK.id, "dark").scheme).toBe("dark");
  });
});

describe("stylesheet", () => {
  const css = themeStyleSheet(THEME_PACKS, FALLBACK_PACK);

  it("keeps unthemed surfaces on the fallback pack", () => {
    expect(css.startsWith(":root {")).toBe(true);
    expect(css).toContain(".dark {");
  });

  it("carries a rule for every pack and scheme", () => {
    for (const pack of THEME_PACKS) {
      for (const scheme of schemesOf(pack)) {
        expect(css).toContain(`[data-pack="${pack.id}"][data-scheme="${scheme}"]`);
      }
    }
  });

  it("emits font roles under their own names, never as a self-reference", () => {
    const vars = themeVars(FALLBACK_PACK, "light");
    expect(vars["--type-mono"]).toBe("var(--font-mono)");
    expect(vars["--font-mono"]).toBeUndefined();
  });
});
