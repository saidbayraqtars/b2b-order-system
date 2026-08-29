import { Readable } from "node:stream";
import { readDesktopReleaseFile } from "@repo/services";

// GET /api/masaustu/<dosya> — masaüstü kabuğunun güncelleme akışı.
//
// `electron-updater` önce `latest.yml`i, sonra orada yazan `.exe`yi istiyor.
// İkisi de `DESKTOP_RELEASE_DIR` klasöründen okunuyor ve **yalnızca beklenen
// uzantılar** veriliyor (bkz. `releaseFileAllowed`); bu bir dosya sunucusu
// değil, tek amaçlı bir uç.
//
// Kimlik istemiyor. Sebep sağlık ucundakiyle aynı: isteği yapan şey oturum
// açamaz — güncelleyici, kullanıcı henüz giriş yapmamışken de çalışıyor ve
// çoğu zaman uygulama hiç açılmadan önce. Verilen şey satıcının yayımladığı
// kurulum dosyası; müşteri verisi taşımıyor.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { dosya: string } },
) {
  const dosya = await readDesktopReleaseFile(params.dosya);
  if (!dosya) {
    return new Response("Bulunamadi", { status: 404 });
  }

  return new Response(Readable.toWeb(dosya.stream as Readable) as ReadableStream, {
    headers: {
      "content-type": dosya.contentType,
      "content-length": String(dosya.size),
      // Sürüm dosyası önbelleğe alınırsa yeni sürüm günlerce görünmez.
      "cache-control": "no-store",
    },
  });
}
