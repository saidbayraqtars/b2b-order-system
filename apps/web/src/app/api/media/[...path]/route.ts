import { readMedia } from "@repo/services";

// GET /api/media/<folder>/<file> — serve an uploaded image.
//
// Unauthenticated on purpose. These are catalogue photos, not documents: the
// mobile app renders them through <Image>, which cannot attach a bearer token,
// and an <img> in a printed page has no session either. Names are random, so a
// URL cannot be guessed, and nothing but images is ever served — `readMedia`
// refuses any extension it does not have a signature for.
export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } },
) {
  const file = await readMedia(params.path);
  if (!file) return new Response("Bulunamadı", { status: 404 });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mime,
      // The name changes whenever the bytes do, so this can be cached hard.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
