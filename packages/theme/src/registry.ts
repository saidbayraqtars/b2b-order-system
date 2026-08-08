import { classicPack } from "./packs/classic";
import { neoMartPack } from "./packs/neo-mart";
import { schemesOf } from "./tokens";
import type { SchemeName, ThemePack } from "./tokens";

/**
 * Every pack this build ships, in switcher order.
 *
 * Adding a design is adding a file here — no component, no route, no migration.
 * The first entry is the fallback: what unthemed parts of the app draw with and
 * what an unknown pack id resolves to.
 */
export const THEME_PACKS: ThemePack[] = [classicPack, neoMartPack];

export const FALLBACK_PACK: ThemePack = classicPack;

/**
 * Resolve a pack id from a cookie, a URL or a tenant file.
 *
 * Never throws and never returns nothing: these ids arrive from places that can
 * be stale (a cookie set before a pack was removed) or hostile (a query
 * string), and a storefront that refuses to render because of a bad theme name
 * would be a self-inflicted outage.
 */
export function findPack(id: string | null | undefined): ThemePack {
  if (!id) return FALLBACK_PACK;
  return THEME_PACKS.find((p) => p.id === id) ?? FALLBACK_PACK;
}

export interface ResolvedTheme {
  pack: ThemePack;
  /** The scheme actually used — not necessarily the one asked for. */
  scheme: SchemeName;
}

/**
 * Pick the pack and the scheme to draw with.
 *
 * A dark-only pack asked for light gets its dark: the alternative is inventing
 * a light scheme the designer never drew. `schemesOf` is what the light/dark
 * toggle uses to decide whether to show itself at all.
 */
export function resolveTheme(
  packId: string | null | undefined,
  scheme: string | null | undefined,
): ResolvedTheme {
  const pack = findPack(packId);
  const wanted = scheme === "light" || scheme === "dark" ? scheme : pack.defaultScheme;
  const available = schemesOf(pack);
  return { pack, scheme: available.includes(wanted) ? wanted : pack.defaultScheme };
}
