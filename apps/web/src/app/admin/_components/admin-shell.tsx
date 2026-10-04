"use client";

import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  CalendarOff,
  ClipboardCheck,
  Handshake,
  FileSpreadsheet,
  FileText,
  Gauge,
  Inbox,
  LayoutTemplate,
  Landmark,
  LayoutDashboard,
  Layers,
  ListChecks,
  Megaphone,
  Package,
  Percent,
  Plug,
  ShieldCheck,
  Sticker,
  Tags,
  Target,
  TrendingUp,
  Truck,
  Undo2,
  Users,
  Wallet,
  ScrollText,
  Coins,
  Timer,
  Wand2,
  ArrowUpCircle,
} from "lucide-react";
import { HashtagSquareIcon, WidgetIcon } from "@/components/reicon";
import { hasPermission, type ModuleKey, type Permission } from "@repo/types";
import { SidebarShell, type SidebarGroup } from "@/components/app-sidebar";
import { useAdvancedView, ViewModeToggle } from "@/components/ui-mode";

interface AdminLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Bu bölümü açan izin. Yoksa herkese görünür (yalnızca panel). */
  permission?: Permission;
  /**
   * İzni paylaşılan ama ekranı bir modüle ait satır (Dağıtım). Modül kapalıysa
   * izin yetse de gizli. Modüle ait izinle açılan satırlara gerek yok: o izin
   * zaten düşmüş geliyor.
   */
  module?: ModuleKey;
  /** Nadir kullanılan ayar ekranı: basit görünümde gizli. */
  advanced?: boolean;
}

/**
 * Yönetim panelinin bölümleri: altı başlık, işe göre.
 *
 * Satış · Katalog · Müşteriler · Finans · Raporlar · Ayarlar. Önceki yedi
 * grup (Saha & Dağıtım, Belge & Rapor, Sistem…) ekranın nerede durduğunu
 * değil kimin yazdığını anlatıyordu; kullanıcı "kampanya nerede" diye
 * aradığında cevap "Satış" olmalı.
 *
 * Her satır kendi iznini taşır ve menü buna göre süzülür — ama süzgeç yalnızca
 * görseldir: ekranın kendisi `requirePage(..., "izin")` ile ayrıca kapalıdır.
 * `advanced` işaretli satırlar basit görünümde gizlenir (nadir kullanılan
 * ayar ekranları); bu da yetki değil, görüntü.
 */
const GROUPS: ReadonlyArray<{ title: string; links: readonly AdminLink[] }> = [
  {
    title: "",
    links: [{ href: "/admin", label: "Panel", icon: LayoutDashboard }],
  },
  {
    title: "Satış",
    links: [
      {
        href: "/admin/promotions",
        label: "Kampanyalar",
        icon: Percent,
        permission: "promotions.manage",
      },
      {
        href: "/admin/volume-tiers",
        label: "Hacim iskontosu",
        icon: TrendingUp,
        permission: "volume_tiers.manage",
      },
      {
        href: "/admin/deliveries",
        label: "Dağıtım",
        icon: Truck,
        permission: "orders.fulfil",
        module: "teslimat",
      },
      {
        href: "/admin/iadeler",
        label: "İadeler",
        icon: Undo2,
        permission: "returns.manage",
      },
      {
        href: "/admin/targets",
        label: "Hedefler",
        icon: Target,
        permission: "targets.manage",
      },
      {
        href: "/admin/prim",
        label: "Prim",
        icon: Coins,
        permission: "commission.manage",
      },
      {
        href: "/admin/basvurular",
        label: "Bayi başvuruları",
        icon: Inbox,
        permission: "applications.manage",
      },
      {
        href: "/admin/siparis-kurallari",
        label: "Sipariş kuralları",
        icon: ClipboardCheck,
        permission: "order_policy.manage",
        advanced: true,
      },
    ],
  },
  {
    title: "Katalog",
    links: [
      {
        href: "/admin/products",
        label: "Ürünler",
        icon: Package,
        permission: "products.view",
      },
      {
        href: "/admin/categories",
        label: "Kategoriler",
        icon: Tags,
        permission: "products.view",
      },
      {
        href: "/admin/stok",
        label: "Stok defteri",
        icon: Boxes,
        permission: "stock.view",
      },
      {
        href: "/admin/toplu-guncelleme",
        label: "Toplu güncelleme",
        icon: FileSpreadsheet,
        permission: "pricing.manage",
      },
    ],
  },
  {
    title: "Müşteriler",
    links: [
      {
        href: "/admin/companies",
        label: "Firmalar",
        icon: Building2,
        permission: "companies.view",
      },
      {
        href: "/admin/customer-groups",
        label: "Gruplar",
        icon: Layers,
        permission: "companies.view",
      },
      {
        href: "/admin/users",
        label: "Kullanıcılar",
        icon: Users,
        permission: "users.manage",
      },
    ],
  },
  {
    title: "Finans",
    links: [
      {
        href: "/admin/kasa",
        label: "Kasa & Banka",
        icon: Wallet,
        permission: "cash.view",
      },
      {
        href: "/admin/cekler",
        label: "Çek & senet",
        icon: ScrollText,
        permission: "cheques.manage",
      },
      {
        href: "/admin/mutabakat",
        label: "Mutabakat",
        icon: Handshake,
        permission: "reconciliation.manage",
      },
      {
        href: "/admin/payment-terms",
        label: "Vadeler",
        icon: CalendarClock,
        permission: "payment_terms.manage",
      },
      {
        href: "/admin/kurlar",
        label: "Döviz kurları",
        icon: Coins,
        permission: "pricing.manage",
        advanced: true,
      },
    ],
  },
  {
    title: "Raporlar",
    links: [
      {
        href: "/admin/reports",
        label: "Raporlar",
        icon: BarChart3,
        permission: "reports.view",
      },
      {
        href: "/admin/analitik",
        label: "Yönetici panosu",
        icon: Gauge,
        permission: "analytics.view",
      },
      {
        href: "/admin/documents",
        label: "Belgeler",
        icon: FileText,
        permission: "documents.view",
      },
      {
        href: "/reports",
        label: "Rapor tasarımcısı",
        icon: Wand2,
        permission: "reports.build",
        advanced: true,
      },
    ],
  },
  {
    title: "Ayarlar",
    links: [
      {
        href: "/admin/organization",
        label: "Kuruluş",
        icon: Landmark,
        permission: "organization.manage",
      },
      {
        href: "/admin/kurulum",
        label: "Kurulum",
        icon: ListChecks,
        permission: "organization.manage",
      },
      {
        href: "/admin/moduller",
        label: "Modüller",
        icon: WidgetIcon,
        permission: "organization.manage",
      },
      {
        href: "/admin/ozel-kodlar",
        label: "Özel kodlar",
        icon: HashtagSquareIcon,
        permission: "organization.manage",
      },
      {
        href: "/admin/announcements",
        label: "Duyurular",
        icon: Megaphone,
        permission: "announcements.manage",
      },
      {
        href: "/admin/erp",
        label: "ERP köprüsü",
        icon: Plug,
        permission: "erp.manage",
      },
      {
        href: "/admin/labels",
        label: "Etiket & fiş",
        icon: Sticker,
        permission: "labels.manage",
        advanced: true,
      },
      {
        href: "/admin/sayfa-duzeni",
        label: "Sayfa düzeni",
        icon: LayoutTemplate,
        permission: "design.manage",
        advanced: true,
      },
      {
        href: "/admin/tatiller",
        label: "Resmî tatiller",
        icon: CalendarOff,
        permission: "organization.manage",
        advanced: true,
      },
      {
        href: "/admin/activity",
        label: "Hareketler",
        icon: Activity,
        permission: "activity.view",
        advanced: true,
      },
      {
        href: "/admin/audit",
        label: "Güvenlik",
        icon: ShieldCheck,
        permission: "audit.view",
        advanced: true,
      },
      {
        href: "/admin/jobs",
        label: "Bakım işleri",
        icon: Timer,
        permission: "jobs.manage",
        advanced: true,
      },
      {
        href: "/admin/surum",
        label: "Sürüm",
        icon: ArrowUpCircle,
        permission: "system.update",
        advanced: true,
      },
    ],
  },
];

/** Yetkisi olmayan ya da modülü kapalı bölümleri ve boşalan grupları atar. */
function visibleGroups(
  permissions: readonly Permission[],
  disabledModules: readonly ModuleKey[],
  advanced: boolean,
): SidebarGroup[] {
  return GROUPS.map((g) => ({
    title: g.title,
    links: g.links.filter(
      (l) =>
        (!l.permission || hasPermission(permissions, l.permission)) &&
        (!l.module || !disabledModules.includes(l.module)) &&
        (advanced || !l.advanced),
    ),
  })).filter((g) => g.links.length > 0);
}

export function AdminShell({
  email,
  permissions,
  disabledModules = [],
  children,
}: {
  email: string;
  permissions: readonly Permission[];
  disabledModules?: readonly ModuleKey[];
  children: ReactNode;
}) {
  const advanced = useAdvancedView();
  return (
    <SidebarShell
      context="Yönetim Paneli"
      footer={<ViewModeToggle />}
      groups={visibleGroups(permissions, disabledModules, advanced)}
      userLabel={email}
    >
      {children}
    </SidebarShell>
  );
}
