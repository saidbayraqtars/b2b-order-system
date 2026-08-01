import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { defaultRouteForRole } from "@repo/auth/rbac";
import { OrderDetailView } from "./_components/order-detail-view";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage([
    "COMPANY_ADMIN",
    "COMPANY_STAFF",
    "SALES_REP",
    "SUPER_ADMIN",
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href={defaultRouteForRole(user.role)}
        className="mb-3 inline-block text-sm text-neutral-500 hover:underline"
      >
        ← Geri
      </Link>
      <OrderDetailView orderId={params.id} />
    </main>
  );
}
