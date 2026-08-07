import type { ReactNode } from "react";
import { prisma } from "@repo/database";
import type { SessionUser } from "@repo/types";
import { AdminShell } from "@/app/admin/_components/admin-shell";
import { PortalNav } from "@/components/portal-nav";
import { RepNav } from "@/components/rep-nav";

/**
 * Rolüne göre doğru kabuğu seçen sarmalayıcı.
 *
 * Neden var: bazı ekranlar tek bir rol ailesine ait değil. Rapor tasarımcısına
 * hem süper admin, hem plasiyer, hem de bayi yöneticisi girer. Bu ekranlar
 * kendi başlarına durdukları için gezinme çubuğu **hiç** çizilmiyordu; içeri
 * giren kullanıcının elinde yalnızca çıkış düğmesi kalıyor, geri dönmek için
 * tarayıcının geri tuşunu kullanması gerekiyordu.
 *
 * Kabuğu burada tek yerden seçiyoruz:
 *  - SUPER_ADMIN  → yönetim kenar çubuğu
 *  - SALES_REP    → plasiyer üst barı
 *  - bayi kullanıcıları → portal üst barı (firma adıyla)
 *
 * Yetki kontrolü burada yapılmaz — çağıran layout kendi `requirePage`'ini
 * çalıştırır. Bu bileşen sadece çerçeve çizer.
 */
export async function RoleShell({
  user,
  current,
  children,
}: {
  user: SessionUser;
  /** Üst bardaki aktif sekmenin yolu ("/reports" gibi). */
  current: string;
  children: ReactNode;
}) {
  if (user.role === "SUPER_ADMIN") {
    return (
      <AdminShell email={user.email} permissions={user.permissions}>
        {children}
      </AdminShell>
    );
  }

  if (user.role === "SALES_REP") {
    return (
      <div>
        <RepNav
          userName={user.name}
          permissions={user.permissions}
          current={current}
        />
        {children}
      </div>
    );
  }

  // Bayi kullanıcısı: firma adı üst barda görünsün diye tek satır okunuyor.
  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
    : null;

  return (
    <div>
      <PortalNav
        role={user.role}
        permissions={user.permissions}
        companyName={company?.name ?? null}
        userName={user.name}
        current={current}
      />
      {children}
    </div>
  );
}
