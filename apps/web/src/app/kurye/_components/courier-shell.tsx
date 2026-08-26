"use client";

import type { ReactNode } from "react";
import { Truck } from "lucide-react";
import { SidebarShell } from "@/components/app-sidebar";

/**
 * Kurye kabuğu.
 *
 * Ayrı bir dosya, yalnızca ikon yüzünden: `SidebarShell` bir istemci bileşeni
 * ve lucide ikonları `"use client"` taşımıyor — sayfa (sunucu bileşeni) ikonu
 * doğrudan geçirdiğinde React onu serileştiremiyor. Portal ve plasiyer
 * kabuklarında da aynı sınır var, orada da istemci tarafında duruyorlar.
 */
export function CourierShell({
  userName,
  children,
}: {
  userName: string;
  children: ReactNode;
}) {
  return (
    <SidebarShell
      context="Kurye"
      groups={[
        {
          title: "",
          links: [{ href: "/kurye", label: "Teslimatlarım", icon: Truck }],
        },
      ]}
      userLabel={userName}
    >
      {children}
    </SidebarShell>
  );
}
