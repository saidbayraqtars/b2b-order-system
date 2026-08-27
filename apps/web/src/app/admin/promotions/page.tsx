import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { PromotionsManager } from "./_components/promotions-manager";

export default async function AdminPromotionsPage() {
  await requirePage(["SUPER_ADMIN"], "promotions.manage");

  return (
    <main className="mx-auto max-w-5xl">
      <PageHeader
        title="Kampanyalar"
        subtitle="Koşul + aksiyon olarak tanımlanan indirimler; fiyatın üzerine uygulanır"
      />
      <PromotionsManager />
      <Note>
        Kampanya kod değil veri: koşullar ve aksiyonlar sunucudaki kural kayıt
        defterinden seçilir. İndirim, grup fiyatı ve firma iskontosunun üzerine
        uygulanır; KDV kampanya sonrası net tutardan hesaplanır. Öncelik
        sırasıyla çalışır, her kampanya bir öncekinin bıraktığı tutarı görür.
      </Note>
    </main>
  );
}
