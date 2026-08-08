import { channels as c } from "../color";
import type { ThemePack } from "../tokens";

/**
 * KURUMSAL — the identity the storefront already had, written down as a pack.
 *
 * This is not a new design. It is the indigo/neutral language of steps 20-21
 * (`brand` = indigo, Jakarta headings, Inter body, JetBrains for anything
 * measured, the faint technical-paper grid) lifted out of hardcoded utility
 * classes and into tokens. Extracting it first is what proves the engine: if
 * switching to this pack changes nothing on screen, the migration was lossless
 * and every other pack is now just data.
 *
 * It is also the only pack that ships both a light and a dark scheme, because
 * it is the one a customer runs in an office all day.
 */
export const classicPack: ThemePack = {
  id: "kurumsal",
  name: "Kurumsal",
  tagline: "Varsayılan kimlik — indigo, aydınlık, teknik kâğıt zemin",
  defaultScheme: "light",

  schemes: {
    light: {
      bg: c("#fafafa"),
      fg: c("#171717"),
      fgMuted: c("#737373"),

      surface: c("#ffffff"),
      surface2: c("#fafafa"),
      surface3: c("#f5f5f5"),

      border: c("#e5e5e5"),
      borderStrong: c("#d4d4d4"),

      primary: c("#4f46e5"),
      onPrimary: c("#ffffff"),
      primarySoft: c("#eef2ff"),
      onPrimarySoft: c("#4338ca"),

      accent: c("#6366f1"),
      onAccent: c("#ffffff"),
      highlight: c("#f59e0b"),
      onHighlight: c("#1c1917"),

      success: c("#047857"),
      successSoft: c("#ecfdf5"),
      warning: c("#b45309"),
      warningSoft: c("#fffbeb"),
      danger: c("#b91c1c"),
      dangerSoft: c("#fef2f2"),
      info: c("#0369a1"),
      infoSoft: c("#f0f9ff"),

      ring: c("#6366f1"),
    },

    dark: {
      bg: c("#0a0a0a"),
      fg: c("#f5f5f5"),
      fgMuted: c("#a3a3a3"),

      surface: c("#171717"),
      surface2: c("#262626"),
      surface3: c("#333333"),

      border: c("#262626"),
      borderStrong: c("#404040"),

      primary: c("#6366f1"),
      onPrimary: c("#ffffff"),
      primarySoft: c("#1e1b4b"),
      onPrimarySoft: c("#a5b4fc"),

      accent: c("#818cf8"),
      onAccent: c("#1e1b4b"),
      highlight: c("#fbbf24"),
      onHighlight: c("#1c1917"),

      success: c("#34d399"),
      successSoft: c("#0b2f27"),
      warning: c("#fbbf24"),
      warningSoft: c("#33270a"),
      danger: c("#f87171"),
      dangerSoft: c("#3b1111"),
      info: c("#38bdf8"),
      infoSoft: c("#0b2a3b"),

      ring: c("#818cf8"),
    },
  },

  fonts: {
    display: "var(--font-jakarta)",
    body: "var(--font-inter)",
    label: "var(--font-mono)",
    mono: "var(--font-mono)",
  },

  radii: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    pill: "9999px",
  },

  effects: {
    shadowCard: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.08)",
    shadowCardHover:
      "0 8px 24px -6px rgb(15 23 42 / 0.12), 0 4px 8px -4px rgb(15 23 42 / 0.06)",
    shadowPrimary: "0 1px 2px 0 rgb(15 23 42 / 0.08)",
    gridLine: "rgb(148 163 184 / 0.18)",
    gridSize: "32px",
    labelTracking: "0.18em",
    labelTransform: "uppercase",
  },
};
