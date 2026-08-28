import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { DeliveryTabs } from "./_components/delivery-tabs";

export const dynamic = "force-dynamic";

export default async function AdminDeliveriesPage() {
  await requirePage(["SUPER_ADMIN"], "orders.fulfil");

  return (
    <main className="mx-auto max-w-5xl">
      <PageHeader
        title="Dağıtım"
        subtitle="Yola çıkan mal ve henüz çıkmayan bakiye"
      />
      <DeliveryTabs />
    </main>
  );
}
