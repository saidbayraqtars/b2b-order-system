/**
 * Where the visitor's design choice is kept.
 *
 * A cookie rather than localStorage on purpose: the storefront decides its pack
 * on the server, and a value the server cannot read would mean rendering the
 * default first and correcting it after hydration — a visible flash of the
 * wrong identity on every navigation. That is precisely the moment a live demo
 * cannot afford.
 *
 * It is a preference, not a credential: no personal data, readable by the
 * page's own script (that is how the switcher writes it), and scoped to the
 * browser that set it. Nobody else's storefront changes.
 */
export const PACK_COOKIE = "b2b-pack";
export const SCHEME_COOKIE = "b2b-scheme";

/** `/portal?tema=neo-mart` — a link that opens straight into a given identity. */
export const PACK_QUERY = "tema";

/** A year. The next presentation should not start by re-picking the theme. */
export const PACK_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
