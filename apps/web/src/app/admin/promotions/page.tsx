import { requirePage } from "@/lib/guard";
import { PromotionsManager } from "./_components/promotions-manager";

export default async function AdminPromotionsPage() {
  await requirePage(["SUPER_ADMIN"], "promotions.manage");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-5 text-xl font-bold">Kampanyalar</h1>
      <PromotionsManager />
      <p className="mt-4 text-sm text-neutral-500">
        Kampanya kod değil veri: koşullar ve aksiyonlar sunucudaki kural
        kayıt defterinden seçilir. İndirim, grup fiyatı ve firma iskontosunun
        üzerine uygulanır; KDV kampanya sonrası net tutardan hesaplanır.
        Öncelik sırasıyla çalışır, her kampanya bir öncekinin bıraktığı tutarı
        görür.
      </p>
    </main>
  );
}
