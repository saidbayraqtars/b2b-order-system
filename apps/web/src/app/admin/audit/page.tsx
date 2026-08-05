import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { AuditClient } from "./_components/audit-client";
import { RetentionPanel } from "./_components/retention-panel";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <AdminNav email={user.email} current="/admin/audit" />
      <div className="mb-4">
        <h1 className="text-xl font-bold">Güvenlik Kaydı</h1>
        <p className="text-sm text-neutral-500">
          Girişler, yetki değişiklikleri ve reddedilen istekler. Kayıtlar
          silinemez ve değiştirilemez.
        </p>
      </div>
      <div className="mb-6">
        <RetentionPanel />
      </div>
      <AuditClient />
    </main>
  );
}
