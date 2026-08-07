import { requirePage } from "@/lib/guard";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";
import { ReportBuilder } from "../_components/report-builder";

export default async function NewReportPage() {
  await requirePage(REPORT_BUILDER_ROLES, "reports.build");

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-5 text-xl font-bold">Yeni Rapor</h1>
      <ReportBuilder />
    </main>
  );
}
