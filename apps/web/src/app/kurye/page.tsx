import { hasPermission } from "@repo/types";
import { requirePage } from "@/lib/guard";
import { Truck } from "lucide-react";
import { SidebarShell } from "@/components/app-sidebar";
import { PageHeader } from "@/components/ui";
import { DeliveryBoard } from "@/components/delivery-board";

export const dynamic = "force-dynamic";

/**
 * Kurye masası.
 *
 * Tek ekran, tek liste: kuryenin telefonunda menü gezmesi gereken bir iş yok.
 * Üst barda yalnızca hesap ve çıkış duruyor — sipariş, katalog ya da kasa
 * bağlantısı bilerek yok, kurye o ekranlara girmemeli.
 */
export default async function CourierPage() {
  const user = await requirePage(
    ["COURIER", "SUPER_ADMIN"],
    "delivery.confirm",
  );

  return (
    <SidebarShell
      context="Kurye"
      groups={[
        {
          title: "",
          links: [{ href: "/kurye", label: "Teslimatlarım", icon: Truck }],
        },
      ]}
      userLabel={user.name}
    >
      <main className="mx-auto max-w-3xl">
        <PageHeader
          title="Teslimatlarım"
          subtitle="Yol tarifi al, teslim et, imzalı belgeyi yükle"
        />
        <DeliveryBoard
          canDispatch={hasPermission(user.permissions, "orders.fulfil")}
        />
      </main>
    </SidebarShell>
  );
}
