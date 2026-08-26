import Link from "next/link";
import {
  Building2,
  ClipboardList,
  ShoppingCart,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { getSalesSummary, getSetupStatus } from "@repo/services";
import { hasPermission } from "@repo/types";
import { requirePage } from "@/lib/guard";
import { formatTRY } from "@/lib/format";
import { PageHeader, StatTile } from "@/components/ui";
import { Panel } from "@/components/form";
import { OrdersBoard } from "@/components/orders-board";
import { CompaniesTable } from "./_components/companies-table";
import { SetupHint } from "./kurulum/_components/setup-wizard";

/** Panelin sağ üstündeki "hepsi" bağlantısı — panoda liste kısa tutuluyor. */
function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-xs font-medium text-ink-faint transition-colors hover:text-ink"
    >
      {label} →
    </Link>
  );
}

// Server-gated too (defense in depth beyond middleware).
//
// Panelin kendisi izin istemez — yetkisi kısılmış bir yöneticinin girebileceği
// bir yer kalmalı. Panonun *bölümleri* izne bakar; hepsi kapalıysa ekran boş
// değil, ne eksik olduğunu söyleyen bir satır gösterir.
export default async function AdminDashboard() {
  const user = await requirePage(["SUPER_ADMIN"]);
  const canSeeCompanies = hasPermission(user.permissions, "companies.view");
  const canSeeOrders = hasPermission(user.permissions, "orders.view");

  // Kurulum bitmemişse pano bunu söyler. Yarım kurulumda cari ve sipariş
  // listeleri boş görünüyor ve bu, "sistem çalışmıyor" gibi okunuyordu.
  const setup = hasPermission(user.permissions, "organization.manage")
    ? await getSetupStatus()
    : null;

  // Sayı kutuları rapor iznine bağlı: ciro, siparişin kendisinden ayrı bir
  // bilgi ve sipariş listesini görebilen herkesin görmesi gerekmiyor.
  const summary = hasPermission(user.permissions, "reports.view")
    ? await getSalesSummary()
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Panel"
        subtitle="Son 30 günün özeti, cari hesaplar ve bekleyen siparişler."
      />

      {setup && !setup.ready && (
        <div className="mb-6">
          <SetupHint done={setup.progress.done} total={setup.progress.total} />
        </div>
      )}

      {summary && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Ciro"
            value={formatTRY(summary.revenue)}
            hint="son 30 gün · onaylanmış siparişler"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatTile
            label="Sipariş"
            value={summary.orderCount}
            hint={`ortalama ${formatTRY(summary.averageOrderValue)}`}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <StatTile
            label="Onay bekleyen"
            value={summary.pendingCount}
            hint={formatTRY(summary.pendingTotal)}
            tone={summary.pendingCount > 0 ? "caution" : "neutral"}
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <StatTile
            label="İptal / red"
            value={summary.lostCount}
            hint={formatTRY(summary.lostTotal)}
            tone={summary.lostCount > 0 ? "critical" : "neutral"}
            icon={<XCircle className="h-4 w-4" />}
          />
        </div>
      )}

      <div className="space-y-6">
        {canSeeCompanies && (
          <Panel
            title="Cari Hesaplar"
            icon={<Building2 className="h-4 w-4" />}
            action={<MoreLink href="/admin/companies" label="Tüm firmalar" />}
            bodyClassName="p-0"
          >
            <CompaniesTable />
          </Panel>
        )}

        {canSeeOrders && (
          <Panel
            title="Siparişler"
            icon={<ShoppingCart className="h-4 w-4" />}
            bodyClassName="p-0"
          >
            <OrdersBoard
              framed={false}
              canApproveCredit={hasPermission(
                user.permissions,
                "orders.approve",
              )}
              canPrint={hasPermission(user.permissions, "documents.view")}
            />
          </Panel>
        )}
      </div>

      {!canSeeCompanies && !canSeeOrders && (
        <p className="mx-auto max-w-md text-center text-body-sm text-ink-faint">
          Hesabınızda görüntüleyebileceğiniz bir bölüm yok. Yetki için sistem
          yöneticinize başvurun.
        </p>
      )}
    </div>
  );
}
