import { requirePage } from "@/lib/guard";
import { ReportsClient } from "./_components/reports-client";

// Sekme `?bolum=` ile adreste; `useSearchParams` bir istemci bileşeninde ancak
// sayfa isteğe göre çizildiğinde Suspense sınırı istemiyor (bkz. /admin/stok).
export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  await requirePage(["SUPER_ADMIN"], "reports.view");

  return (
    <main className="mx-auto max-w-6xl">
      <ReportsClient />
    </main>
  );
}
