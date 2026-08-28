import { requirePage } from "@/lib/guard";
import { defaultRouteForRole } from "@repo/auth/rbac";
import { ORDER_DETAIL_ROLES } from "@/lib/order-access";
import { OrderDetailView } from "./_components/order-detail-view";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage(ORDER_DETAIL_ROLES, "orders.view");

  return (
    <main className="mx-auto max-w-4xl">
      {/* Geri bağlantısı sunucudan geçiyor: rolün varsayılan rotasını `rbac`
          biliyor ve o modülü istemciye taşımanın karşılığı yok. */}
      <OrderDetailView
        orderId={params.id}
        role={user.role}
        backHref={defaultRouteForRole(user.role)}
      />
    </main>
  );
}
