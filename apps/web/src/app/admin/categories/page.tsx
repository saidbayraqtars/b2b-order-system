import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { CategoriesManager } from "./_components/categories-manager";

export default async function AdminCategoriesPage() {
  await requirePage(["SUPER_ADMIN"], "products.view");
  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Kategoriler"
        subtitle="Vitrindeki menü ve ürün kartındaki künye bu ağaçtan çıkar"
      />
      <CategoriesManager />
      <Note>
        Ürün kategorisiz açılmaz, o yüzden ağaç kurulumun ikinci adımıdır. Adı
        değiştirmek yolu (<code>/slug</code>) değiştirmez: eski adresle
        kaydedilmiş bir bağlantı çalışmaya devam eder. Ürünü ya da alt
        kategorisi olan kategori silinemez — önce içini boşaltın.
      </Note>
    </main>
  );
}
