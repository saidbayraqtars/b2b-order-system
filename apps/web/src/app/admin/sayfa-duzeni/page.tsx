import { requirePage } from "@/lib/guard";
import { LayoutEditor } from "./_components/layout-editor";

export default async function PageLayoutAdminPage() {
  await requirePage(["SUPER_ADMIN"], "design.manage");

  return (
    <div>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <h1 className="text-xl font-bold">Sayfa düzeni</h1>
        <LayoutEditor pageKey="PORTAL_HOME" />
        <p className="text-sm text-neutral-500">
          Düzen <strong>veri</strong>: blok listesi ve sırası kayıtta duruyor,
          kodda değil. Blok tiplerinin tek sahibi sunucudaki kayıt defteri —
          buradan gönderilen tanınmayan bir tip reddedilir, kayıtta kalmış ama
          artık tanınmayan bir tip ise çizilmez. Böylece bir kurulum eski bir
          sürüme geri alındığında vitrin açılmaya devam eder.
        </p>
      </main>
    </div>
  );
}
