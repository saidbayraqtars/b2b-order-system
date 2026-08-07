import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";
import { ReportsList } from "./_components/reports-list";

export default async function ReportsPage() {
  await requirePage(REPORT_BUILDER_ROLES, "reports.build");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Raporlarım</h1>
          <p className="text-sm text-neutral-500">
            Kendi raporlarınız ve sizinle paylaşılanlar
          </p>
        </div>
        {/* Gezinme ve çıkış artık kabuğun işi (bkz. layout.tsx). */}
        <Link
          href="/reports/new"
          className="h-9 rounded-md bg-brand-600 px-3 text-sm font-medium leading-9 text-white hover:bg-brand-700"
        >
          Yeni rapor
        </Link>
      </header>

      <ReportsList />
    </main>
  );
}
