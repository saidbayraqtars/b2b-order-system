import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { SignOutButton } from "@/components/sign-out-button";
import { OrdersBoard } from "@/components/orders-board";

// Company-admin approval surface. COMPANY_ADMIN may approve PENDING_APPROVAL;
// PENDING_CREDIT still requires a super admin (canApproveCredit=false).
export default async function ApprovalsPage() {
  const user = await requirePage(["COMPANY_ADMIN", "SUPER_ADMIN"]);
  const isSuper = user.role === "SUPER_ADMIN";

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Sipariş Onayları</h1>
          <p className="text-sm text-neutral-500">{user.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/portal" className="text-sm underline">
            Katalog
          </Link>
          <SignOutButton />
        </div>
      </header>

      <OrdersBoard canApproveCredit={isSuper} />
    </main>
  );
}
