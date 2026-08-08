/**
 * What a design pack is made of.
 *
 * A pack is *data*, not code: a set of colours, fonts, corner radii and a few
 * surface effects. Nothing in a pack knows what a product card looks like — the
 * components stay the same and only the values under them change. That is the
 * whole point: the seller wants to switch identities in front of a customer,
 * mid-sentence, without a rebuild, and a rebuild is exactly what "each design
 * gets its own components" would cost.
 *
 * Colours are stored as `"R G B"` channel triples rather than `#rrggbb`. That
 * is the one format both Tailwind (web) and NativeWind (mobile) can put behind
 * `rgb(var(--c-x) / <alpha-value>)`, which is what makes `bg-primary/15` work
 * on a variable. A hex value there would break every opacity utility.
 */

/** `"255 45 120"` — space separated sRGB channels, no `rgb()` wrapper. */
export type Channels = string;

/**
 * One complete colour scheme. Every key is required: a pack that leaves a
 * surface undefined would fall back to whatever the previous pack left behind,
 * and half-swapped identities are worse than no swap at all.
 */
export interface ThemeColors {
  /** Page ground. */
  bg: Channels;
  /** Default text on `bg`. */
  fg: Channels;
  /** Secondary text: captions, units, help text. */
  fgMuted: Channels;

  /** Card / panel ground. */
  surface: Channels;
  /** Raised or alternate surface: table heads, chips, inputs. */
  surface2: Channels;
  /** Hover / pressed state of a surface. */
  surface3: Channels;

  /** Hairlines between things. */
  border: Channels;
  /** Deliberate borders: inputs, focused cards. */
  borderStrong: Channels;

  /** The identity colour. Primary buttons, active nav, links. */
  primary: Channels;
  /** Text drawn on top of `primary`. */
  onPrimary: Channels;
  /** Tinted background for a primary badge or an active tab. */
  primarySoft: Channels;
  /** Text on `primarySoft`. */
  onPrimarySoft: Channels;

  /** Second identity colour — the "other" call to action. */
  accent: Channels;
  onAccent: Channels;
  /** Third — reserved for things that must be *seen* (offers, stock warnings). */
  highlight: Channels;
  onHighlight: Channels;

  /** Status family. `*Soft` is the badge/banner ground; the solid one is its text. */
  success: Channels;
  successSoft: Channels;
  warning: Channels;
  warningSoft: Channels;
  danger: Channels;
  dangerSoft: Channels;
  info: Channels;
  infoSoft: Channels;

  /** Keyboard focus ring. Usually `primary`, but a neon pack wants it brighter. */
  ring: Channels;
}

/**
 * Every colour key, in one list, so the CSS emitter and the Tailwind mapping
 * agree on what a complete pack is.
 *
 * Written as a `Record<keyof ThemeColors, true>` on purpose: a key added to
 * `ThemeColors` and forgotten here is a compile error, not a token that
 * silently never gets emitted and shows up as an invisible button six screens
 * later.
 */
const COLOR_KEY_SET: Record<keyof ThemeColors, true> = {
  bg: true,
  fg: true,
  fgMuted: true,
  surface: true,
  surface2: true,
  surface3: true,
  border: true,
  borderStrong: true,
  primary: true,
  onPrimary: true,
  primarySoft: true,
  onPrimarySoft: true,
  accent: true,
  onAccent: true,
  highlight: true,
  onHighlight: true,
  success: true,
  successSoft: true,
  warning: true,
  warningSoft: true,
  danger: true,
  dangerSoft: true,
  info: true,
  infoSoft: true,
  ring: true,
};

export const COLOR_KEYS = Object.keys(COLOR_KEY_SET) as Array<keyof ThemeColors>;

/**
 * Which font role gets which family. Values are CSS variable *names* declared
 * by the host app (`--font-inter`, `--font-sora`…), not family names: on the
 * web the font has to be loaded by next/font to exist at all, and on mobile it
 * has to be registered with the native side. The pack picks from what is
 * loaded; it cannot conjure a family.
 */
export interface ThemeFonts {
  /** Headings. */
  display: string;
  /** Body copy. */
  body: string;
  /** Small uppercase labels, chips, eyebrow text. */
  label: string;
  /** Anything measured: SKU, stock, case size, price. Tabular figures. */
  mono: string;
}

export interface ThemeRadii {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  /** Fully round *or not*: a sharp-cornered pack sets this to a small value. */
  pill: string;
}

/**
 * The part of a pack's character that is neither colour nor type: how a card
 * lifts off the page, whether labels shout, whether the ground has a grid.
 * Kept as raw CSS values so a new pack needs no new component branch.
 */
export interface ThemeEffects {
  /** Resting card shadow. */
  shadowCard: string;
  /** Hover shadow for clickable cards. A glow pack puts its glow here. */
  shadowCardHover: string;
  /** Extra shadow on primary buttons — `none` for flat packs. */
  shadowPrimary: string;
  /** Line colour of the background grid. Transparent turns the grid off. */
  gridLine: string;
  /** Grid cell size. */
  gridSize: string;
  /** Letter spacing of `.tech-label`. Neon packs spread wider. */
  labelTracking: string;
  /** `uppercase` or `none` — whether small labels shout. */
  labelTransform: string;
}

export type SchemeName = "light" | "dark";

export interface ThemePack {
  /** URL/cookie safe. This is what `?tema=` and the cookie carry. */
  id: string;
  /** Shown in the switcher. */
  name: string;
  /** One line under the name in the switcher — what this identity is *for*. */
  tagline: string;
  /**
   * Colour schemes this pack ships. A pack may be dark-only (NEO-MART is): the
   * light/dark toggle then has nothing to offer and hides itself rather than
   * showing a switch that silently does nothing.
   */
  schemes: { [K in SchemeName]?: ThemeColors };
  /** Which scheme to use when the pack is selected. */
  defaultScheme: SchemeName;
  fonts: ThemeFonts;
  radii: ThemeRadii;
  effects: ThemeEffects;
}

/** Schemes a pack actually ships, in a stable order. */
export function schemesOf(pack: ThemePack): SchemeName[] {
  return (["light", "dark"] as const).filter((s) => pack.schemes[s] !== undefined);
}

/**
 * The colours to draw with. Falls back to the pack's default scheme when the
 * requested one does not exist — a dark-only pack asked for light must still
 * render, and rendering it in its own dark is honest; rendering it in another
 * pack's light would not be.
 */
export function colorsOf(pack: ThemePack, scheme: SchemeName): ThemeColors {
  const colors = pack.schemes[scheme] ?? pack.schemes[pack.defaultScheme];
  if (!colors) {
    throw new Error(`Tema paketi "${pack.id}" varsayılan şemasını içermiyor: ${pack.defaultScheme}`);
  }
  return colors;
}
