import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { UserManager } from "@/components/user-manager";

export default async function AdminUsersPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AdminNav email={user.email} current="/admin/users" />
      <h1 className="mb-5 text-xl font-bold">Kullanıcılar</h1>
      <UserManager
        currentUserId={user.id}
        allowedRoles={["SUPER_ADMIN", "COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP"]}
        companies={companies}
      />
    </main>
  );
}
