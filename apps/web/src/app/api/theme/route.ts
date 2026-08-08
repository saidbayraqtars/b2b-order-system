import { THEME_PACKS, colorsOf, schemesOf } from "@repo/theme";
import { themeSettings } from "@repo/services";

// GET /api/theme — the design packs this installation ships, and which one it
// opens with.
//
// Exists for the mobile app. The web storefront imports @repo/theme directly and
// never calls this; a phone cannot, so it asks. Sending the packs rather than
// baking them into the bundle is what keeps the phone in step with the
// storefront: an installation that switches its identity in tenant.json changes
// the app too, without a store release.
//
// Unauthenticated, like /api/branding: these are the colours of a shop front.
// Nothing here depends on who is asking, and the login screen itself wants to
// be drawn in the right identity.
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await themeSettings();

  return Response.json(
    {
      // The default the *installation* chose. The app may still remember a
      // presenter's local pick on top of it — same precedence as the web.
      active: { pack: settings.pack, scheme: settings.scheme ?? null },
      switcher: settings.switcher,
      packs: THEME_PACKS.map((pack) => ({
        id: pack.id,
        name: pack.name,
        tagline: pack.tagline,
        defaultScheme: pack.defaultScheme,
        // Only the schemes a pack actually draws — the app hides its light/dark
        // control for a single-scheme pack instead of offering a dead button.
        schemes: Object.fromEntries(
          schemesOf(pack).map((scheme) => [scheme, colorsOf(pack, scheme)]),
        ),
        fonts: pack.fonts,
        radii: pack.radii,
      })),
    },
    {
      // Short, for the same reason the branding route is short: this is edited
      // during support and the change has to show up on the next pull.
      headers: { "cache-control": "public, max-age=60" },
    },
  );
}
