import { COLOR_KEYS, colorsOf, schemesOf } from "./tokens";
import type { SchemeName, ThemeColors, ThemePack, ThemeRadii } from "./tokens";

/**
 * Turning a pack into custom properties.
 *
 * Everything a pack can change is a variable, and every variable is read by a
 * Tailwind utility (see `tailwind.cjs`). No component branches on the pack id —
 * that is what lets a pack be pure data and what lets the switch be instant:
 * writing one attribute on one element repaints the whole surface.
 *
 * Font roles get their own `--type-*` names rather than reusing `--font-*`.
 * `--font-inter` and friends are *families* declared by the host (next/font on
 * the web); `--type-body` is a *role* pointing at one of them. Collapsing the
 * two would produce `--font-mono: var(--font-mono)`, a cycle, and a silently
 * unstyled page.
 */

/** `fgMuted` → `--c-fg-muted`. */
function colorVar(key: string): string {
  return `--c-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
}

/**
 * Colour properties only.
 *
 * Split out because the phone needs exactly this much and no more: React Native
 * has no web fonts to point `--type-*` at and no box shadow of the web's shape.
 * It also lets the mobile app apply a pack it has never seen — the server sends
 * a colour map, this turns it into variables, and `vars()` does the rest.
 */
export function colorVars(colors: ThemeColors): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of COLOR_KEYS) {
    vars[colorVar(key)] = colors[key];
  }
  return vars;
}

export function radiusVars(radii: ThemeRadii): Record<string, string> {
  return {
    "--radius-sm": radii.sm,
    "--radius-md": radii.md,
    "--radius-lg": radii.lg,
    "--radius-xl": radii.xl,
    "--radius-pill": radii.pill,
  };
}

/**
 * The same radii as plain numbers, for React Native.
 *
 * Not a nicety — a crash. Android's view manager casts `borderRadius` straight
 * to a double, so handing it the string `"0.25rem"` throws
 * `java.lang.String cannot be cast to java.lang.Double` and takes the screen
 * down with it. The web keeps the units because CSS wants them; the phone gets
 * numbers.
 *
 * `rootPx` is 16 so a pack's corners come out the same size on both, rather
 * than shrinking to match the platform's 14px default text size — a corner is
 * not font-relative in intent, it was drawn against a 16px web root.
 */
export function radiusPixelVars(radii: ThemeRadii, rootPx = 16): Record<string, number> {
  const px = (value: string): number => {
    const match = /^(-?[\d.]+)(rem|px)?$/.exec(value.trim());
    if (!match) return 0;
    const n = Number(match[1]);
    if (!Number.isFinite(n)) return 0;
    return match[2] === "rem" ? n * rootPx : n;
  };

  return {
    "--radius-sm": px(radii.sm),
    "--radius-md": px(radii.md),
    "--radius-lg": px(radii.lg),
    "--radius-xl": px(radii.xl),
    "--radius-pill": px(radii.pill),
  };
}

/** Every custom property a scheme of a pack sets, as name → value. */
export function themeVars(pack: ThemePack, scheme: SchemeName): Record<string, string> {
  const vars: Record<string, string> = {
    ...colorVars(colorsOf(pack, scheme)),
    ...radiusVars(pack.radii),
  };

  vars["--type-display"] = pack.fonts.display;
  vars["--type-body"] = pack.fonts.body;
  vars["--type-label"] = pack.fonts.label;
  vars["--type-mono"] = pack.fonts.mono;

  vars["--shadow-card"] = pack.effects.shadowCard;
  vars["--shadow-card-hover"] = pack.effects.shadowCardHover;
  vars["--shadow-primary"] = pack.effects.shadowPrimary;
  vars["--grid-line"] = pack.effects.gridLine;
  vars["--grid-size"] = pack.effects.gridSize;
  vars["--label-tracking"] = pack.effects.labelTracking;
  vars["--label-transform"] = pack.effects.labelTransform;

  return vars;
}

function declarations(vars: Record<string, string>, indent = "  "): string {
  return Object.entries(vars)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join("\n");
}

/**
 * One stylesheet holding every pack × every scheme it ships.
 *
 * Emitted into `<head>` once, so switching packs costs a single attribute
 * write with no network round trip and no rebuild — the rule for the new pack
 * is already in the document. Two packs × two schemes is a couple of kilobytes;
 * if the pack list ever grows past a dozen this is the place to start serving
 * only the installed ones.
 *
 * `:root` carries the fallback pack so that everything *outside* the themed
 * scope — the admin panel, the rep screens, the courier board — keeps drawing
 * with the neutral values it always had.
 */
export function themeStyleSheet(packs: ThemePack[], fallback: ThemePack): string {
  const blocks: string[] = [
    `:root {\n  color-scheme: light;\n${declarations(themeVars(fallback, "light"))}\n}`,
    // The admin panel's own light/dark switch is a `dark` class on <html> and
    // knows nothing about packs. It has to keep working, so the fallback pack
    // answers to it as well.
    `.dark {\n  color-scheme: dark;\n${declarations(themeVars(fallback, "dark"))}\n}`,
  ];

  for (const pack of packs) {
    for (const scheme of schemesOf(pack)) {
      // Two attributes = specificity 0,2,0, which beats the `.dark` block
      // above (0,1,0). A themed storefront nested inside a dark <html> is
      // therefore drawn by its pack, not by the admin's night mode.
      blocks.push(
        `[data-pack="${pack.id}"][data-scheme="${scheme}"] {\n  color-scheme: ${scheme};\n${declarations(
          themeVars(pack, scheme),
        )}\n}`,
      );
    }
  }

  return blocks.join("\n");
}
