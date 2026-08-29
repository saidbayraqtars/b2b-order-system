import { requirePage } from "@/lib/guard";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";
import { LinkButton } from "@/components/form";
import { PageHeader } from "@/components/ui";
import { ReportsList } from "./_components/reports-list";

export default async function ReportsPage() {
  await requirePage(REPORT_BUILDER_ROLES, "reports.build");

  return (
    <main className="mx-auto max-w-5xl">
      {/* Gezinme ve çıkış artık kabuğun işi (bkz. layout.tsx). */}
      <PageHeader
        title="Raporlarım"
        subtitle="Kendi raporlarınız ve sizinle paylaşılanlar"
        actions={
          <>
            <LinkButton href="/reports/sablonlar" size="md">
              Hazır raporlar
            </LinkButton>
            <LinkButton href="/reports/dashboards" size="md">
              Panolar
            </LinkButton>
            <LinkButton href="/reports/new" variant="primary" size="md">
              Yeni rapor
            </LinkButton>
          </>
        }
      />

      <ReportsList />
    </main>
  );
}
