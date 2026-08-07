import Link from "next/link";
import { requirePage } from "@/lib/guard";
import { SignOutButton } from "@/components/sign-out-button";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";
import { ReportsList } from "./_components/reports-list";

export default async function ReportsPage() {
  const user = await requirePage(REPORT_BUILDER_ROLES, "reports.build");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Raporlarım</h1>
          <p className="text-sm text-neutral-500">
            Kendi raporlarınız ve sizinle paylaşılanlar
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/reports/new"
            className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium leading-9 text-white"
          >
            Yeni rapor
          </Link>
          <Link
            href={user.role === "SUPER_ADMIN" ? "/admin/reports" : "/rep"}
            className="text-sm underline"
          >
            {user.role === "SUPER_ADMIN" ? "Hazır raporlar" : "Panel"}
          </Link>
          <SignOutButton />
        </div>
      </header>

      <ReportsList />
    </main>
  );
}
