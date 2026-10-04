import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { CustomCodeManager } from "./_components/custom-code-manager";

export const dynamic = "force-dynamic";

/**
 * Özel kod tanımları — ürüne ve firmaya 10'ar sınıflandırma alanı.
 *
 * Vega'nın `KOD1..KOD21` + etiket tablosu desenidir (kılavuz §64): yuva sabit,
 * adı ve seçenekleri kuruluma göre. İzin `organization.manage`, çünkü bir yuvanın
 * adını değiştirmek bütün ekranlarda, raporlarda ve kampanya kurallarında görünen
 * sütun adını değiştirir — bir kuruluş ayarıdır.
 */
export default async function CustomCodesPage() {
  await requirePage(["SUPER_ADMIN"], "organization.manage");

  return (
    <main className="mx-auto max-w-5xl">
      <PageHeader
        title="Özel kodlar"
        subtitle="Ürünlere ve firmalara verilen sınıflandırma alanları: marka, bölge, segment, raf…"
      />
      <CustomCodeManager />
    </main>
  );
}
