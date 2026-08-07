import type { ReactNode } from "react";
import { requirePage } from "@/lib/guard";
import { RoleShell } from "@/components/role-shell";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";

/**
 * Rapor tasarımcısının kabuğu.
 *
 * Bu bölüm üç rol ailesine birden açık olduğu için kendi menüsü yoktu; içeri
 * giren kullanıcı gezinme çubuğunu kaybediyordu. `RoleShell` rolüne göre doğru
 * çerçeveyi çiziyor, sayfalar yalnızca içeriklerini döndürüyor.
 *
 * Sayfalardaki `requirePage` kaldırılmadı: layout'un çalışması güvenlik sınırı
 * sayılmaz, her ekran kendi kapısını ayrıca kapatır.
 */
export default async function ReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePage(REPORT_BUILDER_ROLES, "reports.build");
  return (
    <RoleShell user={user} current="/reports">
      {children}
    </RoleShell>
  );
}
