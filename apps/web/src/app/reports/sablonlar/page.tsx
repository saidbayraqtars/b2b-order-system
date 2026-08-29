import { requirePage } from "@/lib/guard";
import { REPORT_BUILDER_ROLES } from "@/lib/report-context";
import { LinkButton } from "@/components/form";
import { PageHeader } from "@/components/ui";
import { TemplateGallery } from "./_components/template-gallery";

// Süzgeç `?kategori=` ile adreste; `useSearchParams` istemci bileşeninde ancak
// sayfa isteğe göre çizildiğinde Suspense sınırı istemiyor (bkz. /admin/stok).
export const dynamic = "force-dynamic";

/**
 * Hazır rapor şablonları.
 *
 * Rapor tasarımcısı boş tuvalle açılıyordu; kurulumun ilk gününde bir
 * kullanıcının "neyi sorabileceğimi bilmiyorum" dediği yer orası. Buradaki
 * her kart tam bir rapor tanımı ve tek tıkla kullanıcının **kendi** raporuna
 * kopyalanıyor — kopya, bağlantı değil: kurulduktan sonra serbestçe
 * değiştirilebiliyor ve şablonun yeni sürümü onu geri almıyor.
 */
export default async function ReportTemplatesPage() {
  await requirePage(REPORT_BUILDER_ROLES, "reports.build");

  return (
    <main className="mx-auto max-w-5xl">
      <PageHeader
        title="Hazır raporlar"
        subtitle="Tek tıkla kurun, sonra kendinize göre değiştirin"
        actions={
          <LinkButton href="/reports" size="md">
            Raporlarım
          </LinkButton>
        }
      />

      <TemplateGallery />
    </main>
  );
}
