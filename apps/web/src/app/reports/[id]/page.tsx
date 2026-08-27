import { notFound } from "next/navigation";
import { getReportDefinition } from "@repo/services";
import { REPORT_DATASET_LABELS } from "@repo/types";
import { requirePage } from "@/lib/guard";
import { LinkButton } from "@/components/form";
import { PageHeader } from "@/components/ui";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { ReportBuilder } from "../_components/report-builder";
import { ScheduleCard } from "../_components/schedule-card";

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
    <main className="mx-auto max-w-7xl">
      {/* Başlık sayfanın, künye şeridi tasarımcının: ad burada bir *etiket*,
          aşağıdaki şeritte düzenlenen bir alan. İkisi de "Rapor adı" diye
          yazsaydı Adım 6'daki çift başlık hatası tekrarlanırdı. */}
      <PageHeader
        title={definition.name}
        subtitle={`${REPORT_DATASET_LABELS[definition.dataset]} · ${
          definition.canEdit ? "sizin" : `${definition.ownerName} tarafından paylaşıldı`
        }`}
        back={{ href: "/reports", label: "Raporlarım" }}
        actions={
          // Server-built downloads: the file someone saves and the file that
          // arrives by e-mail are then the same bytes. The designer's own CSV
          // button stays for previews that were never saved.
          <>
            <LinkButton
              href={`/api/reports/definitions/${definition.id}/export?format=XLSX`}
            >
              Excel indir
            </LinkButton>
            <LinkButton
              href={`/api/reports/definitions/${definition.id}/export?format=CSV`}
            >
              CSV indir
            </LinkButton>
            <LinkButton href={`/documents/reports/${definition.id}`}>
              Yazdır / PDF
            </LinkButton>
          </>
        }
      />
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
      <div className="mt-6">
        <ScheduleCard reportId={definition.id} canEdit={definition.canEdit} />
      </div>
    </main>
  );
}
