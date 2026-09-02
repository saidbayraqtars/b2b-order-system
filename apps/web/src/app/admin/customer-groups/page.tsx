import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { GroupsManager } from "./_components/groups-manager";

export default async function AdminCustomerGroupsPage() {
  await requirePage(["SUPER_ADMIN"], "companies.view");

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Müşteri grupları"
        subtitle="Fiyat seviyesi: bayi, zincir, toptancı"
      />
      <GroupsManager />
      <Note collapsible defaultOpen={false}>
        Grup, firmaya özel liste fiyatı tanımlamak için kullanılır: fiyat
        kademeleri ürün sayfasında grup seçilerek girilir. Grubu olmayan firma
        liste fiyatını görür. Firması ya da fiyat kademesi olan grup silinemez —
        silinebilseydi o firmanın fiyatı sessizce liste fiyatına dönerdi.
      </Note>
    </main>
  );
}
