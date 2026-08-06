import { readBrandingAsset } from "@repo/services";

// GET /api/branding/<file> — serve a file from the tenant folder's branding/.
//
// Unauthenticated, like /api/media and for the same reason: these are marks
// rendered by <img> on a login page and inside a printed document, neither of
// which carries a session. There is nothing private here — it is the logo the
// customer puts on its own invoices.
//
// Not served from public/: public/ is a build-time directory, and the entire
// point of the tenant folder is that it can be replaced without a rebuild.
export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } },
) {
  const asset = await readBrandingAsset(params.path);
  if (!asset) return new Response("Bulunamadı", { status: 404 });

  return new Response(new Uint8Array(asset.data), {
    headers: {
      "content-type": asset.mime,
      // A logo is usually SVG, and SVG can carry script. This one comes from
      // the operator's own folder rather than an upload, but it is still served
      // to a browser: the CSP neuters anything embedded in it, and nosniff
      // stops the type being second-guessed.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
      // Short: the file is edited during support and the change must show up
      // on a refresh, not after a cache expiry nobody can explain.
      "cache-control": "public, max-age=60",
    },
  });
}
