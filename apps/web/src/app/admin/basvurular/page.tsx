import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { ApplicationBoard } from "./_components/application-board";

export const dynamic = "force-dynamic";

export default async function DealerApplicationsPage() {
  await requirePage(["SUPER_ADMIN"], "applications.manage");

  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Bayi başvuruları"
        subtitle="Onaylandığında firma kartı ve yönetici hesabı açılır"
      />
      <ApplicationBoard />
    </main>
  );
}
