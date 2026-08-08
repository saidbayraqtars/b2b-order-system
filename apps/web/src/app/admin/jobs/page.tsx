import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { JobBoard } from "./_components/job-board";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  await requirePage(["SUPER_ADMIN"], "jobs.manage");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <PageHeader
        title="Bakım işleri"
        subtitle="Arka planda kendiliğinden çalışan temizlik işleri — ne zaman çalıştı, ne oldu"
      />
      <JobBoard />
    </main>
  );
}
