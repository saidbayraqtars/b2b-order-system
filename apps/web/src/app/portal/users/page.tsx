import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PortalNav } from "@/components/portal-nav";
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
    <div>
      <PortalNav
        role={user.role}
        companyName={company?.name ?? user.name}
        userName={user.name}
        current="/portal/users"
      />
      <div className="mx-auto max-w-5xl px-4 pb-6">
        <h1 className="mb-4 text-lg font-semibold">Kullanıcılar</h1>
        <UserManager
          currentUserId={user.id}
          fixedCompanyId={user.companyId}
          allowedRoles={["COMPANY_ADMIN", "COMPANY_STAFF"]}
        />
        <p className="mt-4 text-sm text-neutral-500">
          Firma yöneticisi sipariş onaylayabilir ve kullanıcı yönetebilir;
          personel yalnızca sipariş oluşturur.
        </p>
      </div>
    </div>
  );
}
