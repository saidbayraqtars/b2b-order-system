import { notFound } from "next/navigation";
import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { Badge, PageHeader } from "@/components/ui";
import { ProductEditor } from "../_components/product-editor";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  await requirePage(["SUPER_ADMIN"], "products.manage");

  // Adı sunucuda okuyoruz: başlık ilk boyamada doğru yazsın diye. Düzenleyici
  // ürünün tamamını kendi çekiyor, bu sorgu yalnızca künye için.
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, brand: true, isActive: true },
  });
  if (!product) notFound();

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title={product.name}
        back={{ href: "/admin/products", label: "Ürünler" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {product.brand && <span>{product.brand}</span>}
            {!product.isActive && <Badge>Pasif</Badge>}
          </span>
        }
      />
      <ProductEditor productId={product.id} />
    </main>
  );
}
