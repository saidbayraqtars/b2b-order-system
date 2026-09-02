import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { UserManager } from "@/components/user-manager";

export default async function AdminUsersPage() {
  const user = await requirePage(["SUPER_ADMIN"], "users.manage");

  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Kullanıcılar"
        subtitle="Her hesap tipi kendi ekranını görür; yetki roldan değil kişiden okunur"
      />
      <UserManager
        currentUserId={user.id}
        allowedRoles={[
          "SUPER_ADMIN",
          "COMPANY_ADMIN",
          "COMPANY_STAFF",
          "SALES_REP",
          "COURIER",
        ]}
        companies={companies}
        grantablePermissions={user.permissions}
      />
      <Note collapsible defaultOpen={false}>
        Kendinizde olmayan bir yetkiyi veremezsiniz — liste zaten kendi
        kümenizle sınırlı ve sunucu aynı kuralı yeniden uygular. Kendi
        hesabınızı pasife alamaz, silemez ve kullanıcı yönetimi yetkisini kendi
        üzerinizden kaldıramazsınız: aksi hâlde geri açacak kimse kalmazdı.
      </Note>
    </main>
  );
}
