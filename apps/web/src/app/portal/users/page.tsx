import Link from "next/link";
import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { SignOutButton } from "@/components/sign-out-button";
import { UserManager } from "@/components/user-manager";

// A company admin managing their own staff. The service pins every read and
// write to their company and refuses the two system roles, so this screen
// cannot be used to reach outside the firm.
export default async function PortalUsersPage() {
  const user = await requirePage(["COMPANY_ADMIN"]);

  if (!user.companyId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">Kullanıcılar</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Hesabınıza firma atanmamış.
        </p>
      </main>
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { name: true },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Kullanıcılar</h1>
          <p className="text-sm text-neutral-500">{company?.name ?? user.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/portal" className="text-sm underline">
            Katalog
          </Link>
          <Link href="/portal/orders" className="text-sm underline">
            Siparişlerim
          </Link>
          <SignOutButton />
        </div>
      </header>

      <UserManager
        currentUserId={user.id}
        fixedCompanyId={user.companyId}
        allowedRoles={["COMPANY_ADMIN", "COMPANY_STAFF"]}
      />

      <p className="mt-4 text-sm text-neutral-500">
        Firma yöneticisi sipariş onaylayabilir ve kullanıcı yönetebilir; personel
        yalnızca sipariş oluşturur.
      </p>
    </main>
  );
}
