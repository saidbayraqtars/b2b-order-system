/**
 * Ask the media route for a resized copy.
 *
 * Only our own upload URLs are touched. A product image can also be an ordinary
 * external URL (the seeded catalogue has some), and appending a query string to
 * somebody else's CDN link would at best be ignored and at worst break it.
 *
 * The widths mirror the whitelist in @repo/services/image — a value outside it
 * is served as the original, so a mismatch shows up as a slow page rather than
 * a missing picture.
 */
const OURS = "/api/media/";

export function mediaSrc(url: string, width: 160 | 320 | 640 | 960): string {
  return url.startsWith(OURS) ? `${url}?w=${width}` : url;
}

/**
 * 1x/2x pair for a fixed-size slot. Returned undefined for foreign URLs so the
 * attribute is left off entirely rather than set to a single meaningless entry.
 */
export function mediaSrcSet(
  url: string,
  width: 160 | 320 | 640,
): string | undefined {
  if (!url.startsWith(OURS)) return undefined;
  const retina = (width * 2) as 320 | 640 | 960;
  return `${url}?w=${width} 1x, ${url}?w=${retina} 2x`;
}
