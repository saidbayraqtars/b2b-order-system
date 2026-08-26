import { hasPermission } from "@repo/types";
import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { DeliveryBoard } from "@/components/delivery-board";
import { CourierShell } from "./_components/courier-shell";

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
    <CourierShell userName={user.name}>
      <main className="mx-auto max-w-3xl">
        <PageHeader
          title="Teslimatlarım"
          subtitle="Yol tarifi al, teslim et, imzalı belgeyi yükle"
        />
        <DeliveryBoard
          canDispatch={hasPermission(user.permissions, "orders.fulfil")}
        />
      </main>
    </CourierShell>
  );
}
