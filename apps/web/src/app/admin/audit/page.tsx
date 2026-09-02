import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { AuditClient } from "./_components/audit-client";
import { RetentionPanel } from "./_components/retention-panel";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requirePage(["SUPER_ADMIN"], "audit.view");

  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Güvenlik kaydı"
        subtitle="Girişler, yetki değişiklikleri ve reddedilen istekler"
      />
      <div className="mb-6">
        <RetentionPanel />
      </div>
      <AuditClient />
      <Note collapsible defaultOpen={false}>
        Kayıtlar <strong>silinemez ve değiştirilemez</strong>: defter yalnızca
        büyür. Tek istisna yukarıdaki saklama süresi ve o da toptan siler, tek
        tek değil — bir satırı seçip yok etmenin yolu yok. Silmeden önce CSV
        alın; güvenlik olaylarını saklama seçeneği açıkken giriş denemeleri ve
        yetki değişiklikleri temizlikten muaf kalır.
      </Note>
    </main>
  );
}
