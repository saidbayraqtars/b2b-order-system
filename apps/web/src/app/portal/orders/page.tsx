import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { SignOutButton } from "@/components/sign-out-button";
import { OrdersBoard } from "@/components/orders-board";

// The buying company's own order list. Staff read it; approving stays on
// /portal/approvals, which is company-admin only.
export default async function PortalOrdersPage() {
  const user = await requirePage([
    "COMPANY_ADMIN",
    "COMPANY_STAFF",
    "SUPER_ADMIN",
  ]);
  const canAct = user.role !== "COMPANY_STAFF";

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Siparişlerim</h1>
          <p className="text-sm text-neutral-500">{user.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/portal" className="text-sm underline">
            Katalog
          </Link>
          <Link href="/portal/statement" className="text-sm underline">
            Ekstre
          </Link>
          <SignOutButton />
        </div>
      </header>

      <OrdersBoard
        canApproveCredit={user.role === "SUPER_ADMIN"}
        canAct={canAct}
      />
    </main>
  );
}
