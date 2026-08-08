import { channels as c } from "../color";
import type { ThemePack } from "../tokens";

/**
 * NEO-MART — the first pack that is not ours.
 *
 * Taken from the four Google Stitch screens under `docs/design/stitch/`
 * (PNG + generated HTML). Stitch emits a Material-3 token set; the values below
 * are its colours mapped onto our own, smaller vocabulary:
 *
 *   surface-container      → surface        surface-variant  → surface2
 *   surface-container-high → surface3       outline-variant  → border
 *   primary (neon pink)    → primary        secondary (mint) → accent
 *   tertiary (yellow)      → highlight      error            → danger
 *
 * Two things about it are deliberate, not oversights:
 *
 * - **Dark only.** The design has no light scheme and inventing one would put a
 *   second, made-up identity behind the customer's name. The light/dark toggle
 *   hides itself while this pack is on.
 * - **Corners are nearly square** (`0.125rem`), including `pill`, which is
 *   `0.75rem` rather than fully round. That is the loudest single difference
 *   from the default pack — badges stop being lozenges.
 *
 * `info` is the one value Stitch never produced (its palette has no
 * informational colour). A neon blue is used so that "for your information"
 * does not have to borrow the success mint and read as "done".
 */
export const neoMartPack: ThemePack = {
  id: "neo-mart",
  name: "NEO-MART",
  tagline: "Koyu neon toptan vitrini — pembe, nane, keskin köşeler",
  defaultScheme: "dark",

  schemes: {
    dark: {
      bg: c("#0a0a12"),
      fg: c("#e8e0f0"),
      fgMuted: c("#a098b0"),

      surface: c("#141422"),
      surface2: c("#1e1e30"),
      surface3: c("#28283e"),

      border: c("#302840"),
      borderStrong: c("#5a5068"),

      primary: c("#ff2d78"),
      onPrimary: c("#1a0010"),
      primarySoft: c("#b3004e"),
      onPrimarySoft: c("#ffe0ec"),

      accent: c("#00ffcc"),
      onAccent: c("#001a1a"),
      highlight: c("#ffe04a"),
      onHighlight: c("#1a1000"),

      success: c("#00ffcc"),
      successSoft: c("#004d3d"),
      warning: c("#ffe04a"),
      warningSoft: c("#665200"),
      danger: c("#ff4444"),
      dangerSoft: c("#3d0f0f"),
      info: c("#4aa8ff"),
      infoSoft: c("#0b2540"),

      ring: c("#ff2d78"),
    },
  },

  fonts: {
    display: "var(--font-sora)",
    body: "var(--font-inter)",
    label: "var(--font-grotesk)",
    mono: "var(--font-mono)",
  },

  radii: {
    sm: "0.125rem",
    md: "0.125rem",
    lg: "0.25rem",
    xl: "0.5rem",
    pill: "0.75rem",
  },

  effects: {
    // Stitch's `.card-border-glow` / `.btn-glow`: light comes from the element,
    // not from a light source above it. No offset, no blur downwards.
    shadowCard: "inset 0 0 12px rgb(255 45 120 / 0.05)",
    shadowCardHover: "0 0 16px rgb(255 45 120 / 0.35), inset 0 0 12px rgb(255 45 120 / 0.08)",
    shadowPrimary: "0 0 14px rgb(255 45 120 / 0.45)",
    gridLine: "rgb(0 255 204 / 0.05)",
    gridSize: "40px",
    labelTracking: "0.22em",
    labelTransform: "uppercase",
  },
};
