import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { RateManager } from "./_components/rate-manager";

export const dynamic = "force-dynamic";

export default async function RatesPage() {
  await requirePage(["SUPER_ADMIN"], "pricing.manage");

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <PageHeader
        title="Döviz kurları"
        subtitle="Dövizle listelenen ürünler bu kurla TL'ye çevrilir; kur siparişte donar"
      />
      <RateManager />
    </main>
  );
}
