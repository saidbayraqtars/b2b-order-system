import { requirePage } from "@/lib/guard";
import { GroupsManager } from "./_components/groups-manager";

export default async function AdminCustomerGroupsPage() {
  await requirePage(["SUPER_ADMIN"], "companies.view");

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-5 text-xl font-bold">Müşteri Grupları</h1>
      <GroupsManager />
      <p className="mt-4 text-sm text-neutral-500">
        Grup, firmaya özel liste fiyatı tanımlamak için kullanılır: fiyat
        kademeleri ürün sayfasında grup seçilerek girilir.
      </p>
    </main>
  );
}
