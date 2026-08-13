import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadRoot } from "./upload-root";

/**
 * Resized copies of uploaded images.
 *
 * The catalogue holds photographs straight off a phone: two to five megabytes
 * each, drawn at 120 pixels wide in a product grid. On a field connection that
 * is the difference between a list that loads and one that does not, and the
 * mobile app pays it on every scroll.
 *
 * Variants are produced **on demand and cached on disk** rather than at upload
 * time. Two reasons, and the first one decided it: there are already thousands
 * of products with photos, and on-demand means every one of them gets a thumb
 * without a backfill script that has to be run on each installation. The second
 * is that the set of sizes stops being a decision made once — adding a width
 * costs a cache miss, not a migration.
 *
 * Cached files are never stale: an uploaded file's name is random and its bytes
 * never change, so a variant of it does not either. Deleting the original drops
 * its variants with it (see `deleteVariants`).
 */

/**
 * The widths a caller may ask for.
 *
 * A whitelist, not a range: `?w=` arrives from the client, and an open range is
 * an invitation to make the server resize the same photo into ten thousand
 * slightly different files. These four cover the thumbnail, the grid, the
 * detail page and a retina detail page.
 */
export const VARIANT_WIDTHS = [160, 320, 640, 960] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

export function isVariantWidth(value: unknown): value is VariantWidth {
  return VARIANT_WIDTHS.includes(Number(value) as VariantWidth);
}

/** Where a variant of `segments` at `width` is cached. */
function cachePath(segments: string[], width: VariantWidth): string {
  const root = path.resolve(uploadRoot());
  // Leading dot keeps the cache out of the orphan sweep's way, which only ever
  // looks at ordinary upload folders.
  return path.join(root, ".cache", `w${width}`, ...segments) + ".webp";
}

export interface ImageVariant {
  data: Buffer;
  mime: string;
}

/**
 * A resized WebP copy of an already-read image.
 *
 * WebP for every variant, because the variant is only ever requested by our own
 * pages: everything that can display a b2b portal at all has supported WebP for
 * years, and one output format means one cached file per size instead of one
 * per size per format. The original is still served untouched at its own URL,
 * so anything that cannot cope has somewhere to go.
 *
 * Never enlarges (`withoutEnlargement`): asking for 960 from an 800-wide photo
 * gives back the 800, rather than a blurred 960 that costs more to send.
 */
export async function buildVariant(
  source: Buffer,
  width: VariantWidth,
): Promise<Buffer> {
  const sharp = await loadSharp();
  if (!sharp) throw new Error("sharp yüklenemedi");

  return sharp(source, { animated: true })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}

/**
 * sharp is loaded lazily and its absence is survivable.
 *
 * It is a native module: it needs the binary for the platform it is running on,
 * and it is the one dependency here that can be present in the lockfile and
 * still fail to load in a container. If that happens the callers fall back to
 * serving the original image — a site with heavy pictures, not a site with no
 * pictures. The failure is logged once rather than on every request, because a
 * missing thumbnail is not worth a log line per image per visitor.
 */
type SharpFactory = (typeof import("sharp"))["default"];
let sharpModule: SharpFactory | null | undefined;

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = (await import("sharp")).default;
  } catch (err) {
    sharpModule = null;
    console.error(
      "sharp yüklenemedi — görseller küçültülmeden, orijinal boyutta sunulacak",
      err,
    );
  }
  return sharpModule;
}

/**
 * Read a variant, building and caching it on the first request.
 *
 * A failure to write the cache is not a failure to serve: the bytes are already
 * in hand, and a read-only or full disk should make the site slow, not broken.
 */
export async function readVariant(
  segments: string[],
  width: VariantWidth,
  readOriginal: () => Promise<Buffer | null>,
): Promise<ImageVariant | null> {
  const target = cachePath(segments, width);

  const cached = await readFile(target).catch(() => null);
  if (cached) return { data: cached, mime: "image/webp" };

  const original = await readOriginal();
  if (!original) return null;

  let data: Buffer;
  try {
    data = await buildVariant(original, width);
  } catch {
    // Not an image sharp can decode (a corrupt upload, or a format it was built
    // without). Fall back to the original rather than 404-ing a file that is
    // plainly there.
    return null;
  }

  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  } catch {
    // Serve it anyway.
  }

  return { data, mime: "image/webp" };
}

/** Drop every cached variant of one stored file. */
export async function deleteVariants(segments: string[]): Promise<void> {
  for (const width of VARIANT_WIDTHS) {
    await rm(cachePath(segments, width), { force: true }).catch(() => {});
  }
}
