import { notFound } from "next/navigation";
import { getReportDefinition } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { ReportBuilder } from "../_components/report-builder";

export default async function ReportPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage(REPORT_BUILDER_ROLES, "reports.build");

  // Loaded server-side so the designer opens with the saved design already in
  // place. A missing report and one the caller may not see are both 404 here —
  // the page must not confirm that someone else's report exists.
  const definition = await getReportDefinition(
    params.id,
    reportContext(user),
  ).catch(() => null);
  if (!definition) notFound();

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-5 text-xl font-bold">{definition.name}</h1>
      <ReportBuilder
        saved={{
          id: definition.id,
          name: definition.name,
          description: definition.description,
          dataset: definition.dataset,
          isShared: definition.isShared,
          canEdit: definition.canEdit,
          ownerName: definition.ownerName,
          config: definition.config,
        }}
      />
    </main>
  );
}
