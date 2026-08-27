import { requirePage } from "@/lib/guard";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";
import { PageHeader } from "@/components/ui";
import { ReportBuilder } from "../_components/report-builder";

export default async function NewReportPage() {
  await requirePage(REPORT_BUILDER_ROLES, "reports.build");

  return (
    <main className="mx-auto max-w-7xl">
      <PageHeader
        title="Yeni rapor"
        subtitle="Bir veri kümesi seçin, sütunları ekleyin — sonuç sağda anında görünür"
        back={{ href: "/reports", label: "Raporlarım" }}
      />
      <ReportBuilder />
    </main>
  );
}
