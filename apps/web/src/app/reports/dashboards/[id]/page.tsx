import { requirePage } from "@/lib/guard";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";
import { DashboardView } from "../../_components/dashboard-view";

export default async function DashboardPage({
  params,
}: {
  params: { id: string };
}) {
  // Opening a board only needs "view"; the editor inside checks canEdit, which
  // the server decides.
  await requirePage(REPORT_BUILDER_ROLES, "reports.view");

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <DashboardView id={params.id} />
    </main>
  );
}
