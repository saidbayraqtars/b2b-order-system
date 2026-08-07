import { redirect, notFound } from "next/navigation";
import { prisma } from "@repo/database";
import { getCatalogProduct } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { resolvePortalContext } from "@/lib/portal-context";
import { PortalNav } from "@/components/portal-nav";
import { ActingAsBar } from "@/components/storefront/acting-as-bar";
import { ProductDetail } from "./_components/product-detail";

export const dynamic = "force-dynamic";

type Props = {
  params: { id: string };
  searchParams: { companyId?: string };
};

// Ürün detayı. Fiyat sunucuda, firmaya göre çözülüp gönderiliyor — istemci
// hiçbir zaman ham fiyat listesi görmüyor.
export default async function ProductPage({ params, searchParams }: Props) {
  const user = await requirePage([
    "COMPANY_ADMIN",
    "COMPANY_STAFF",
    "SALES_REP",
    "SUPER_ADMIN",
  ], "products.view");

  const ctx = await resolvePortalContext(user, searchParams.companyId);

  // Vekil kullanıcı firma seçmeden ürüne gelemez (paylaşılmış bir bağlantı
  // olabilir): seçim ekranına gönder.
  if (!ctx.companyId) redirect("/portal");

  const [product, category] = await Promise.all([
    getCatalogProduct(params.id, ctx.companyId),
    // Kategori adı ürün bulunmasa da sorulur; iki sorgu tek turda gitsin.
    prisma.product
      .findUnique({
        where: { id: params.id },
        select: { category: { select: { name: true } } },
      })
      .then((p) => p?.category?.name ?? null),
  ]);

  if (!product) notFound();

  return (
    <div className="min-h-screen tech-paper">
      <PortalNav
        role={user.role}
        permissions={user.permissions}
        companyName={ctx.companyName}
        userName={user.name}
        current="/portal"
        isProxy={ctx.isProxy}
        companyId={ctx.companyId}
      />
      {ctx.isProxy && (
        <ActingAsBar
          companyName={ctx.companyName ?? "Firma"}
          availableCredit={ctx.availableCredit}
        />
      )}
      <div className="mx-auto max-w-6xl px-4 pb-10">
        <ProductDetail
          product={product}
          companyId={ctx.companyId}
          categoryName={category}
        />
      </div>
    </div>
  );
}
