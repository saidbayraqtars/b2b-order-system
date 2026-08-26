import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PortalNav } from "@/components/portal-nav";
import { UserManager } from "@/components/user-manager";
import { EmptyState, PageHeader } from "@/components/ui";

// A company admin managing their own staff. The service pins every read and
// write to their company and refuses the two system roles, so this screen
// cannot be used to reach outside the firm.
export default async function PortalUsersPage() {
  const user = await requirePage(["COMPANY_ADMIN"], "users.manage");

  if (!user.companyId) {
    return (
      <main className="mx-auto max-w-3xl">
        <PageHeader title="Kullanıcılar" />
        <EmptyState label="Hesabınıza firma atanmamış." />
      </main>
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { name: true },
  });

  return (
    <PortalNav
      role={user.role}
      permissions={user.permissions}
      companyName={company?.name ?? user.name}
      userName={user.name}
    >
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Kullanıcılar"
          subtitle="Firma yöneticisi sipariş onaylayabilir ve kullanıcı yönetebilir; personel yalnızca sipariş oluşturur."
        />
        <UserManager
          currentUserId={user.id}
          fixedCompanyId={user.companyId}
          allowedRoles={["COMPANY_ADMIN", "COMPANY_STAFF"]}
          grantablePermissions={user.permissions}
        />
      </div>
    </PortalNav>
  );
}
