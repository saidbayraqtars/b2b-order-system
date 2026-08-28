import { hasPermission } from "@repo/types";
import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { CategoriesManager } from "./_components/categories-manager";

/**
 * Kapı `products.view`, düzenleme `categories.manage`.
 *
 * İkisi bilerek ayrı: kataloğu gören biri ağacı da görebilmeli — ürünün hangi
 * dalda durduğunu okumak, o dalı taşıyabilmeyi gerektirmiyor. Ama ekran bunu
 * söylemiyordu: yalnız `products.view` verilmiş bir kullanıcı ekranı açıyor,
 * kategori adını değiştiriyor, uç 403 dönüyor ve sebebini görmüyordu.
 *
 * Çözüm kapıyı yükseltmek değil (o zaman kataloğu görmek isteyen kişi ağacı
 * hiç göremezdi), izni **ekrana taşımak**: yetkisi olmayan düzenleme
 * kontrollerini hiç görmüyor. Kararın kendisi yine sunucuda — bu yalnızca
 * yapılamayacak şeyi önermemek.
 */
export default async function AdminCategoriesPage() {
  const user = await requirePage(["SUPER_ADMIN"], "products.view");
  const canManage = hasPermission(user.permissions, "categories.manage");

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Kategoriler"
        subtitle={
          canManage
            ? "Vitrindeki menü ve ürün kartındaki künye bu ağaçtan çıkar"
            : "Vitrindeki menü ve ürün kartındaki künye bu ağaçtan çıkar — salt okunur"
        }
      />
      <CategoriesManager canManage={canManage} />
      <Note>
        Ürün kategorisiz açılmaz, o yüzden ağaç kurulumun ikinci adımıdır. Adı
        değiştirmek yolu (<code>/slug</code>) değiştirmez: eski adresle
        kaydedilmiş bir bağlantı çalışmaya devam eder. Ürünü ya da alt
        kategorisi olan kategori silinemez — önce içini boşaltın.
        {!canManage && (
          <>
            {" "}
            Ağacı <strong>değiştirmek</strong> için <code>categories.manage</code>{" "}
            izni gerekiyor; sizde yalnızca okuma izni var.
          </>
        )}
      </Note>
    </main>
  );
}
