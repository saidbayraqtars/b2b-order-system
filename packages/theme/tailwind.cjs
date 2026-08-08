/**
 * The Tailwind half of the theme engine — the same token names on both apps.
 *
 * Deliberately plain CommonJS with no TypeScript and no colour values in it.
 * Two reasons:
 *
 *  1. Mobile's `tailwind.config.js` is loaded by plain Node (Metro/NativeWind),
 *     which cannot `require` the TS sources in `src/`.
 *  2. Nothing here can drift from a pack, because nothing here *is* a pack:
 *     every entry points at a custom property that `themeStyleSheet()` writes.
 *     The only thing shared between this file and `src/tokens.ts` is the list
 *     of names, and `src/theme.test.ts` fails the build if the two disagree.
 *
 * Colours are `rgb(var(--c-x) / <alpha-value>)` rather than a hex value so that
 * opacity utilities keep working: `bg-primary/15` is how every soft badge and
 * every hover tint in the app is written.
 *
 * @param {{ web?: boolean }} [options] web-only utilities (shadows, the grid
 *   background) are skipped on React Native, which has neither.
 */
function themeExtension(options = {}) {
  const { web = false } = options;

  const color = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

  /** @type {Record<string, unknown>} */
  const extension = {
    colors: {
      bg: color("bg"),
      fg: color("fg"),
      "fg-muted": color("fg-muted"),

      surface: color("surface"),
      surface2: color("surface2"),
      surface3: color("surface3"),

      border: color("border"),
      "border-strong": color("border-strong"),

      primary: color("primary"),
      "on-primary": color("on-primary"),
      "primary-soft": color("primary-soft"),
      "on-primary-soft": color("on-primary-soft"),

      accent: color("accent"),
      "on-accent": color("on-accent"),
      highlight: color("highlight"),
      "on-highlight": color("on-highlight"),

      success: color("success"),
      "success-soft": color("success-soft"),
      warning: color("warning"),
      "warning-soft": color("warning-soft"),
      danger: color("danger"),
      "danger-soft": color("danger-soft"),
      info: color("info"),
      "info-soft": color("info-soft"),

      ring: color("ring"),
    },

    fontFamily: {
      // Roles, not families. A pack points each role at a loaded family.
      display: ["var(--type-display)"],
      body: ["var(--type-body)"],
      label: ["var(--type-label)"],
      mono: ["var(--type-mono)"],
    },

    borderRadius: {
      DEFAULT: "var(--radius-md)",
      sm: "var(--radius-sm)",
      md: "var(--radius-md)",
      lg: "var(--radius-lg)",
      xl: "var(--radius-xl)",
      "2xl": "var(--radius-xl)",
      // `rounded-full` is a *pack decision*: a sharp-cornered identity turns
      // lozenge badges into small rectangles, and that is most of its look.
      full: "var(--radius-pill)",
    },
  };

  if (web) {
    extension.boxShadow = {
      card: "var(--shadow-card)",
      "card-hover": "var(--shadow-card-hover)",
      primary: "var(--shadow-primary)",
    };
    extension.backgroundImage = {
      "tech-grid":
        "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
    };
    extension.backgroundSize = {
      "tech-grid": "var(--grid-size) var(--grid-size)",
    };
  }

  return extension;
}

module.exports = { themeExtension };
