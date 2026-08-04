import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { PromotionsManager } from "./_components/promotions-manager";

export default async function AdminPromotionsPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <AdminNav email={user.email} current="/admin/promotions" />
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
