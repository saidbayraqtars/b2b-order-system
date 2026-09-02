import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { LayoutEditor } from "./_components/layout-editor";

export default async function PageLayoutAdminPage() {
  await requirePage(["SUPER_ADMIN"], "design.manage");

  return (
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title="Sayfa düzeni"
        subtitle="Vitrinde hangi blok, hangi sırada çizilsin"
      />
      <LayoutEditor pageKey="PORTAL_HOME" />
      <Note collapsible defaultOpen={false}>
        Düzen <strong>veri</strong>: blok listesi ve sırası kayıtta duruyor,
        kodda değil. Blok tiplerinin tek sahibi sunucudaki kayıt defteri —
        buradan gönderilen tanınmayan bir tip reddedilir, kayıtta kalmış ama
        artık tanınmayan bir tip ise çizilmez. Böylece bir kurulum eski bir
        sürüme geri alındığında vitrin açılmaya devam eder.
      </Note>
    </main>
  );
}
