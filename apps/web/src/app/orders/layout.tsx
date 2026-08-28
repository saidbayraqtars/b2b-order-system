import type { ReactNode } from "react";
import { requirePage } from "@/lib/guard";
import { RoleShell } from "@/components/role-shell";
import { ORDER_DETAIL_ROLES } from "@/lib/order-access";

/**
 * Sipariş detayının kabuğu.
 *
 * Tasarım dilinin "tek kabuk" kuralını çiğneyen son ekran buydu: sipariş
 * detayına dört rol birden giriyor (süper admin, plasiyer, bayi yöneticisi,
 * bayi personeli) ve tek bir menü hepsine uymadığı için ekran **hiç** menüsüz
 * çiziliyordu. İçeri giren kullanıcının elinde yalnızca başlıktaki "Geri"
 * bağlantısı kalıyordu — bir tarayıcı geri tuşunun yazıya dökülmüş hâli.
 *
 * Rapor tasarımcısı aynı sorunu aynı çözümle kapatmıştı; `RoleShell` rolüne
 * göre doğru çerçeveyi seçiyor. `current` hiçbir sekmeyle eşleşmiyor ve bu
 * doğru: sipariş detayı menüdeki bir bölüm değil, oraya bir listeden giriliyor.
 *
 * Sayfadaki `requirePage` kaldırılmadı: layout'un çalışması güvenlik sınırı
 * sayılmaz, her ekran kendi kapısını ayrıca kapatır.
 */
export default async function OrdersLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePage(ORDER_DETAIL_ROLES, "orders.view");
  return (
    <RoleShell user={user} current="/orders">
      {children}
    </RoleShell>
  );
}
