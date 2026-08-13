import { requirePage } from "@/lib/guard";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";
import { DashboardsList } from "../_components/dashboards-list";

export default async function DashboardsPage() {
  await requirePage(REPORT_BUILDER_ROLES, "reports.build");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <DashboardsList />
    </main>
  );
}
