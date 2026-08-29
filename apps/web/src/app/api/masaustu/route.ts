import { desktopReleaseSummary } from "@repo/services";

// GET /api/masaustu — yayında hangi masaüstü sürümü var.
//
// `electron-updater` bu ucu kullanmıyor (o `latest.yml`i istiyor); bu, insanın
// ve kurulum sayfasının sorusu: "indireceğim dosya hangi sürüm". Sürüm
// yayımlanmamışsa alanlar boş dönüyor — 404 yerine boş cevap, çünkü "sürüm
// yok" bir hata değil, bir durum.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const ozet = await desktopReleaseSummary();
  return Response.json(
    {
      ...ozet,
      // İndirme adresi göreli: kurulum aynı sunucudan yapılıyor ve mutlak
      // adres yazmak, tünel/ters vekil arkasında yanlış konağı basardı.
      downloadPath: ozet.file ? `/api/masaustu/${ozet.file}` : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
