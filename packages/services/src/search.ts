import { prisma } from "@repo/database";
import type { Prisma } from "@repo/database";
import type { Role } from "@repo/types";

// Genel arama: ürün, firma, sipariş no — tek kutudan.
//
// Ayrı bir uç olmasının sebebi **kapsam**. Üç ayrı listeleme ucunu arka arkaya
// çağırmak da mümkündü ama her biri kendi kapsamını kendi yazıyor ve bir
// arama kutusu, hepsinin kesişimini tek cevapta vermek zorunda: bir plasiyer
// portföyü dışındaki firmayı aramayla bulamamalı, bir bayi kullanıcısı başka
// bayinin siparişini aramayla açamamalı. Kapsam burada bir kez yazılıyor ve
// çağıranın rolüne göre daralıyor.
//
// Arama **başlangıç değil içerik** eşleştiriyor: toptancının ürün adları
// "Çaykur Rize Turist 1000 gr" gibi ve kullanıcı "rize" yazıyor.

export interface SearchHit {
  kind: "product" | "company" | "order";
  id: string;
  /** Ekranda okunan ad. */
  title: string;
  /** İkinci satır: kategori, şehir, tutar. */
  subtitle: string | null;
  /** Tıklanınca gidilecek yol; rolüne göre değişiyor. */
  href: string;
}

export interface SearchContext {
  userId: string;
  role: Role;
  companyId: string | null;
  permissions: readonly string[];
}

/** Her tür için ayrı ayrı; toplam 24 satır bir açılır listede zaten çok. */
const PER_KIND = 8;

/** Tek harflik bir arama bütün kataloğu getirirdi. */
const MIN_LENGTH = 2;

export async function globalSearch(
  query: string,
  ctx: SearchContext,
): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < MIN_LENGTH) return [];

  const can = (p: string) => ctx.permissions.includes(p);
  const like = { contains: q, mode: "insensitive" as const };

  const [products, companies, orders] = await Promise.all([
    can("products.view") ? searchProducts(like) : [],
    can("companies.view") ? searchCompanies(like, ctx) : [],
    can("orders.view") ? searchOrders(q, ctx) : [],
  ]);

  return [...companies, ...orders, ...products];
}

async function searchProducts(
  like: Prisma.StringFilter,
): Promise<SearchHit[]> {
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { name: like },
        { brand: like },
        { variants: { some: { sku: like } } },
      ],
    },
    select: {
      id: true,
      name: true,
      brand: true,
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: PER_KIND,
  });

  return rows.map((p) => ({
    kind: "product" as const,
    id: p.id,
    title: p.name,
    subtitle: [p.brand, p.category.name].filter(Boolean).join(" · ") || null,
    href: `/admin/products/${p.id}`,
  }));
}

async function searchCompanies(
  like: Prisma.StringFilter,
  ctx: SearchContext,
): Promise<SearchHit[]> {
  // Plasiyer yalnızca portföyünü, bayi kullanıcısı yalnızca kendi firmasını
  // buluyor. Süper admin hepsini.
  const scope: Prisma.CompanyWhereInput =
    ctx.role === "SUPER_ADMIN"
      ? {}
      : ctx.role === "SALES_REP"
        ? { salesRepId: ctx.userId }
        : { id: ctx.companyId ?? "__none__" };

  const rows = await prisma.company.findMany({
    where: {
      AND: [scope, { OR: [{ name: like }, { taxNumber: like }] }],
    },
    select: {
      id: true,
      name: true,
      currentBalance: true,
      addresses: { select: { city: true }, take: 1 },
    },
    orderBy: { name: "asc" },
    take: PER_KIND,
  });

  return rows.map((c) => ({
    kind: "company" as const,
    id: c.id,
    title: c.name,
    subtitle: c.addresses[0]?.city ?? null,
    href: `/admin/companies/${c.id}`,
  }));
}

async function searchOrders(
  q: string,
  ctx: SearchContext,
): Promise<SearchHit[]> {
  // Sipariş **numarayla** aranıyor, firma adıyla değil: firma adı zaten firma
  // sonuçlarını getiriyor ve oradan siparişlerine tek tık var. Numarayı arayan
  // kişi elinde bir belge tutuyor.
  const scope: Prisma.OrderWhereInput =
    ctx.role === "SUPER_ADMIN"
      ? {}
      : ctx.role === "SALES_REP"
        ? { company: { salesRepId: ctx.userId } }
        : ctx.role === "COURIER"
          ? { shipments: { some: { courierId: ctx.userId } } }
          : { companyId: ctx.companyId ?? "__none__" };

  const rows = await prisma.order.findMany({
    where: {
      AND: [scope, { orderNumber: { contains: q, mode: "insensitive" } }],
    },
    select: {
      id: true,
      orderNumber: true,
      grandTotal: true,
      company: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: PER_KIND,
  });

  return rows.map((o) => ({
    kind: "order" as const,
    id: o.id,
    title: o.orderNumber,
    subtitle: o.company.name,
    href: `/orders/${o.id}`,
  }));
}
