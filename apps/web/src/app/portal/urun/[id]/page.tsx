import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@repo/database";
import { getCatalogProduct } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { PortalNav } from "@/components/portal-nav";
import { ProductDetail } from "./_components/product-detail";

type Params = { params: { id: string } };

// Ürün detayı. Fiyat sunucuda, firmaya göre çözülüp gönderiliyor — istemci
// hiçbir zaman ham fiyat listesi görmüyor.
export default async function ProductPage({ params }: Params) {
  const user = await requirePage([
    "COMPANY_ADMIN",
    "COMPANY_STAFF",
    "SUPER_ADMIN",
  ]);

  if (!user.companyId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">B2B Portal</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Bu ekran firma hesapları içindir.{" "}
          <Link href="/admin" className="underline">
            Yönetim paneline
          </Link>{" "}
          gidin.
        </p>
      </main>
    );
  }

  const [company, product] = await Promise.all([
    prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    }),
    getCatalogProduct(params.id, user.companyId),
  ]);

  if (!product) notFound();

  const category = await prisma.category.findUnique({
    where: { id: product.categoryId },
    select: { name: true },
  });

  return (
    <div className="min-h-screen tech-paper">
      <PortalNav
        role={user.role}
        companyName={company?.name ?? "Firma"}
        userName={user.name}
        current="/portal"
      />
      <div className="mx-auto max-w-6xl px-4 pb-10">
        <ProductDetail
          product={product}
          companyId={user.companyId}
          categoryName={category?.name ?? null}
        />
      </div>
    </div>
  );
}
