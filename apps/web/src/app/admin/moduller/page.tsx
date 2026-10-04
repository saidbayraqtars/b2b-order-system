import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { ModuleManager } from "./_components/module-manager";

export const dynamic = "force-dynamic";

/**
 * Modüller — kurulumda kullanılmayan özellik kümelerini kapatma.
 *
 * Sistemi sadeleştirmenin en büyük kaldıracı: çek almayan, kurye
 * çalıştırmayan, kampanya yapmayan bir müşteri o ekranları hiç görmemeli.
 * Kapatmak veriyi silmez; yeniden açmak her şeyi geri getirir.
 */
export default async function ModulesPage() {
  await requirePage(["SUPER_ADMIN"], "organization.manage");

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Modüller"
        subtitle="Bu kurulumda kullanılmayan özellikleri kapatın — menüden, ekranlardan ve mobilden kalkarlar"
      />
      <ModuleManager />
    </main>
  );
}
