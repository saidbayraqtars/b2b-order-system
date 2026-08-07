import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { DeliveryBoard } from "@/components/delivery-board";

export const dynamic = "force-dynamic";

export default async function AdminDeliveriesPage() {
  await requirePage(["SUPER_ADMIN"], "orders.fulfil");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <PageHeader
        title="Dağıtım"
        subtitle="Sevkiyatlara kurye ata, teslim durumunu izle"
      />
      <DeliveryBoard canDispatch />
    </main>
  );
}
