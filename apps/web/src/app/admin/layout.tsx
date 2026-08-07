import type { ReactNode } from "react";
import { requirePage } from "@/lib/guard";
import { AdminShell } from "./_components/admin-shell";

/**
 * Yönetim panelinin kabuğu. Kenar çubuğu 23 sayfanın her birinde tek tek
 * çizilmek yerine burada bir kez çiziliyor; sayfalar yalnızca kendi içeriğini
 * döndürür.
 *
 * Rol kontrolü burada da var (layout her alt sayfada çalışır) ama sayfalardaki
 * `requirePage` kaldırılmıyor: layout'un çalıştığı garanti bir güvenlik sınırı
 * değil ve her ekranın kendi izni ayrıca gerekiyor.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePage(["SUPER_ADMIN"]);
  return (
    <AdminShell email={user.email} permissions={user.permissions}>
      {children}
    </AdminShell>
  );
}
