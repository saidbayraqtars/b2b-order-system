import { isVariantWidth, readMedia, readVariant } from "@repo/services";

// GET /api/media/<folder>/<file>[?w=320] — serve an uploaded image.
//
// Unauthenticated on purpose. These are catalogue photos, not documents: the
// mobile app renders them through <Image>, which cannot attach a bearer token,
// and an <img> in a printed page has no session either. Names are random, so a
// URL cannot be guessed, and nothing but images is ever served — `readMedia`
// refuses any extension it does not have a signature for.
//
// `?w=` asks for a resized WebP copy. The width must be one of the four the
// service allows; anything else is served as the original rather than refused,
// because a mistyped query string should not leave a hole in a page.
export async function GET(
  req: Request,
  { params }: { params: { path: string[] } },
) {
  const requested = new URL(req.url).searchParams.get("w");

  if (requested && isVariantWidth(requested)) {
    const variant = await readVariant(
      params.path,
      Number(requested) as 160 | 320 | 640 | 960,
      async () => (await readMedia(params.path))?.data ?? null,
    );
    if (variant) return send(variant.data, variant.mime);
    // Fall through: the file may exist but be something sharp cannot resize.
  }

  const file = await readMedia(params.path);
  if (!file) return new Response("Bulunamadı", { status: 404 });
  return send(file.data, file.mime);
}

function send(data: Buffer, mime: string): Response {
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": mime,
      // The name changes whenever the bytes do, so this can be cached hard.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
