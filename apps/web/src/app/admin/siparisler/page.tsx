import { hasPermission } from "@repo/types";
import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { OrdersBoard } from "@/components/orders-board";

export const dynamic = "force-dynamic";

// Satıcının sipariş listesi. Önceden yalnız panonun en altındaydı: arama yok,
// süzgeç yok, yüz sipariş cari tablosunun altında sırayla. Pano artık yalnız
// onay bekleyenleri gösteriyor; geri kalan her şey burada.
export default async function OrdersPage() {
  const user = await requirePage(["SUPER_ADMIN"], "orders.view");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Siparişler" subtitle="Durum ve firmaya göre bulun" />
      <OrdersBoard
        canApproveCredit={hasPermission(user.permissions, "orders.approve")}
        canPrint={hasPermission(user.permissions, "documents.view")}
      />
    </div>
  );
}
