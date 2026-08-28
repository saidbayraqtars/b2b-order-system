import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { PromotionsTabs } from "./_components/promotions-tabs";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  await requirePage(["SUPER_ADMIN"], "promotions.manage");

  return (
    <main className="mx-auto max-w-5xl">
      <PageHeader
        title="Kampanyalar"
        subtitle="Koşul + aksiyon olarak tanımlanan indirimler; fiyatın üzerine uygulanır"
      />
      <PromotionsTabs />
    </main>
  );
}
