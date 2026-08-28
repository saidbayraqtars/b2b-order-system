import { Prisma, prisma } from "@repo/database";

// Kampanya performansı — "açtığım kampanya ne yaptı?"
//
// Simülatörün aynadaki hâli: o **açmadan önce** ne olacağını soruyor, bu
// **açtıktan sonra** ne olduğunu. İkisi ayrı ekran değil ayrı sekme, çünkü
// oranı yazan kişi ikisine de aynı yerden bakıyor.
//
// Rapor tasarımcısında `PROMOTIONS` veri kümesi zaten vardı ve bu ekranın
// yerine geçmiyordu: orada her açılışta sütun seçmek, gruplamak ve dört
// kampanyayı yan yana koymak gerekiyordu. Küratörlü ekranın işi tam bu —
// hangi sayıların yan yana durması gerektiğini bilmek.
//
// **Üç dürüstlük kuralı** (§6.2 ile aynı aile):
//
//  1. **Ciro kampanyaya yazılmıyor.** Kampanyalı siparişin cirosu, kampanya
//     olmasaydı gelmeyecek ciro değil; müşterilerin çoğu zaten alacaktı.
//     Kolonun adı bu yüzden "kampanyalı sipariş cirosu", "kampanya cirosu"
//     değil. Artımlı etki ancak kontrol grubuyla ölçülür ve o grubun burada
//     olmadığı ekranda yazıyor.
//  2. **Karşılaştırma aynı pencerede.** Kampanyalı siparişin ortalama sepeti,
//     aynı aralıktaki **kampanyasız** siparişlerin ortalamasıyla yan yana
//     duruyor. Farklı dönemlerin ortalamasını kıyaslamak mevsimselliği
//     kampanya etkisi sanmak olurdu.
//  3. **Az örnek işaretleniyor.** Beş siparişin altındaki bir kampanyanın
//     ortalama sepeti bir sayı değil bir gürültü; ekran onu ortalama diye
//     göstermiyor.

/** Ortalama sepetin yazılabilmesi için gereken sipariş sayısı. */
export const PERFORMANCE_MIN_ORDERS = 5;

/** İptal ve red ciro değil — kampanya sayacı da onları saymıyor. */
const LIVE_ORDER = Prisma.sql`o."status" NOT IN ('CANCELLED', 'REJECTED', 'DRAFT')`;

export type PromotionStatus = "kapali" | "bekliyor" | "aktif" | "bitti";

export interface PromotionPerformanceRow {
  promotionId: string;
  name: string;
  code: string | null;
  status: PromotionStatus;
  startsAt: string | null;
  endsAt: string | null;

  /** Yaşayan siparişlerdeki kullanım sayısı. */
  redemptions: number;
  /** Kaç ayrı firma kullandı. */
  companies: number;
  /** Verilen toplam iskonto (KDV hariç). */
  discountTotal: string;
  /**
   * Kampanyanın uygulandığı siparişlerin toplam tutarı.
   *
   * **Kampanyanın getirdiği ciro değil**: o siparişlerin çoğu kampanya
   * olmasaydı da gelirdi. Kolon "kampanyalı sipariş cirosu".
   */
  revenueOnOrders: string;
  /** İskontonun o cironun yüzde kaçı olduğu. */
  discountSharePct: number | null;
  /** Kampanyalı siparişin ortalama sepeti; az örnekte null. */
  avgOrderValue: string | null;

  /**
   * Kotanın ne kadarı kullanıldı (yüzde). Limit yoksa null — "sınırsız"
   * bir yüzdeyle anlatılamaz.
   */
  quotaUsedPct: number | null;
  usageLimit: number | null;

  /** İlk siparişi bu kampanyayla olan firma sayısı — kazanım işareti. */
  firstOrderCompanies: number;
  /** İlk kullanımından sonra tekrar sipariş veren firma sayısı. */
  returnedCompanies: number;
}

export interface PromotionPerformance {
  windowDays: number | null;
  from: string | null;
  to: string;
  rows: PromotionPerformanceRow[];

  /** Aralıktaki bütün yaşayan siparişler — karşılaştırmanın paydası. */
  ordersInWindow: number;
  revenueInWindow: string;
  /** Kampanya **görmemiş** siparişlerin ortalama sepeti; az örnekte null. */
  baselineAvgOrderValue: string | null;
  /** Bütün kampanyaların toplam iskontosu. */
  discountTotal: string;
}

function statusOf(
  p: { enabled: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date,
): PromotionStatus {
  if (!p.enabled) return "kapali";
  if (p.startsAt && p.startsAt > now) return "bekliyor";
  if (p.endsAt && p.endsAt < now) return "bitti";
  return "aktif";
}

function money(
  value: Prisma.Decimal | number | string | null | undefined,
): string {
  return new Prisma.Decimal(value ?? 0).toFixed(2);
}

/**
 * Pencere: kaç günlük geçmişe bakılacağı. `null` = başından beri.
 *
 * Gün bazlı, ay bazlı değil: kampanyalar ay sınırına oturmuyor, bir hafta
 * sürenleri de var.
 */
export async function promotionPerformance(
  windowDays: number | null,
  now = new Date(),
): Promise<PromotionPerformance> {
  const from =
    windowDays === null
      ? null
      : new Date(now.getTime() - windowDays * 86_400_000);

  const promotions = await prisma.promotion.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      enabled: true,
      startsAt: true,
      endsAt: true,
      usageLimit: true,
      priority: true,
      createdAt: true,
    },
    orderBy: [{ enabled: "desc" }, { priority: "asc" }, { createdAt: "desc" }],
  });

  const [totals, perPromotion, firsts, returns] = await Promise.all([
    windowTotals(from),
    perPromotionTotals(from),
    firstOrderCompanies(from),
    returnedCompanies(from),
  ]);

  const rows = promotions.map((p): PromotionPerformanceRow => {
    const agg = perPromotion.get(p.id);
    const redemptions = agg?.redemptions ?? 0;
    const revenue = new Prisma.Decimal(agg?.revenue ?? 0);
    const discount = new Prisma.Decimal(agg?.discount ?? 0);

    return {
      promotionId: p.id,
      name: p.name,
      code: p.code,
      status: statusOf(p, now),
      startsAt: p.startsAt?.toISOString() ?? null,
      endsAt: p.endsAt?.toISOString() ?? null,
      redemptions,
      companies: agg?.companies ?? 0,
      discountTotal: discount.toFixed(2),
      revenueOnOrders: revenue.toFixed(2),
      discountSharePct: revenue.gt(0)
        ? discount.div(revenue).mul(100).toNumber()
        : null,
      avgOrderValue:
        redemptions >= PERFORMANCE_MIN_ORDERS
          ? revenue.div(redemptions).toFixed(2)
          : null,
      quotaUsedPct:
        p.usageLimit && p.usageLimit > 0
          ? (redemptions / p.usageLimit) * 100
          : null,
      usageLimit: p.usageLimit,
      firstOrderCompanies: firsts.get(p.id) ?? 0,
      returnedCompanies: returns.get(p.id) ?? 0,
    };
  });

  // Taban: kampanya **görmemiş** siparişlerin ortalaması. Kampanyalı
  // siparişleri de içeren bir ortalamayla kıyaslamak, kampanyayı kendisiyle
  // kıyaslamak olurdu.
  const promotedOrders = totals.promotedOrders;
  const plainOrders = totals.orders - promotedOrders;
  const plainRevenue = new Prisma.Decimal(totals.revenue).minus(
    totals.promotedRevenue,
  );

  return {
    windowDays,
    from: from?.toISOString() ?? null,
    to: now.toISOString(),
    rows,
    ordersInWindow: totals.orders,
    revenueInWindow: money(totals.revenue),
    baselineAvgOrderValue:
      plainOrders >= PERFORMANCE_MIN_ORDERS
        ? plainRevenue.div(plainOrders).toFixed(2)
        : null,
    discountTotal: rows
      .reduce((sum, r) => sum.plus(r.discountTotal), new Prisma.Decimal(0))
      .toFixed(2),
  };
}

/** Aralığın tamamı: kaç sipariş, ne kadar ciro, kaçı kampanya gördü. */
async function windowTotals(from: Date | null): Promise<{
  orders: number;
  revenue: string;
  promotedOrders: number;
  promotedRevenue: string;
}> {
  const [row] = await prisma.$queryRaw<
    Array<{
      orders: bigint;
      revenue: string;
      promoted: bigint;
      promotedRevenue: string;
    }>
  >`
    SELECT COUNT(*) AS orders,
           COALESCE(SUM(o."grandTotal"), 0)::text AS revenue,
           COUNT(*) FILTER (WHERE pr."orderId" IS NOT NULL) AS promoted,
           COALESCE(
             SUM(o."grandTotal") FILTER (WHERE pr."orderId" IS NOT NULL), 0
           )::text AS "promotedRevenue"
    FROM "Order" o
    LEFT JOIN (
      SELECT DISTINCT "orderId" FROM "PromotionRedemption"
    ) pr ON pr."orderId" = o."id"
    WHERE ${LIVE_ORDER}
      ${from ? Prisma.sql`AND o."createdAt" >= ${from}` : Prisma.empty}
  `;

  return {
    orders: Number(row?.orders ?? 0),
    revenue: row?.revenue ?? "0",
    promotedOrders: Number(row?.promoted ?? 0),
    promotedRevenue: row?.promotedRevenue ?? "0",
  };
}

/**
 * Kampanya başına toplamlar.
 *
 * Ciro **sipariş başına bir kez** sayılıyor: aynı siparişte aynı kampanyanın
 * iki satırı olsaydı (olmamalı, ama olursa) ciro iki katına çıkardı.
 */
async function perPromotionTotals(from: Date | null): Promise<
  Map<
    string,
    { redemptions: number; companies: number; discount: string; revenue: string }
  >
> {
  const rows = await prisma.$queryRaw<
    Array<{
      promotionId: string;
      redemptions: bigint;
      companies: bigint;
      discount: string;
      revenue: string;
    }>
  >`
    SELECT pr."promotionId" AS "promotionId",
           COUNT(DISTINCT pr."orderId") AS redemptions,
           COUNT(DISTINCT pr."companyId") AS companies,
           COALESCE(SUM(pr."amount"), 0)::text AS discount,
           COALESCE(SUM(o."grandTotal"), 0)::text AS revenue
    FROM "PromotionRedemption" pr
    JOIN "Order" o ON o."id" = pr."orderId"
    WHERE ${LIVE_ORDER}
      ${from ? Prisma.sql`AND pr."createdAt" >= ${from}` : Prisma.empty}
    GROUP BY 1
  `;

  return new Map(
    rows.map((r) => [
      r.promotionId,
      {
        redemptions: Number(r.redemptions),
        companies: Number(r.companies),
        discount: r.discount,
        revenue: r.revenue,
      },
    ]),
  );
}

/**
 * Kazanım: ilk siparişi bu kampanyayla olan firmalar.
 *
 * "İlk sipariş" bütün geçmişe göre belirleniyor, pencereye göre değil — üç ay
 * önce alan bir firma, doksan günlük pencerede yeni müşteri değildir.
 */
async function firstOrderCompanies(
  from: Date | null,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<
    Array<{ promotionId: string; count: bigint }>
  >`
    WITH firsts AS (
      SELECT o."companyId" AS company_id, MIN(o."createdAt") AS first_at
      FROM "Order" o
      WHERE ${LIVE_ORDER}
      GROUP BY 1
    )
    SELECT pr."promotionId" AS "promotionId",
           COUNT(DISTINCT pr."companyId") AS count
    FROM "PromotionRedemption" pr
    JOIN "Order" o ON o."id" = pr."orderId"
    JOIN firsts f ON f.company_id = pr."companyId" AND f.first_at = o."createdAt"
    WHERE ${LIVE_ORDER}
      ${from ? Prisma.sql`AND pr."createdAt" >= ${from}` : Prisma.empty}
    GROUP BY 1
  `;
  return new Map(rows.map((r) => [r.promotionId, Number(r.count)]));
}

/**
 * Tutundurma: kampanyayı ilk kullandıktan **sonra** yeniden sipariş veren
 * firmalar.
 *
 * Sonraki siparişin kampanyalı olup olmadığına bakılmıyor; soru "geri geldi
 * mi", "yine indirim aldı mı" değil.
 */
async function returnedCompanies(
  from: Date | null,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<
    Array<{ promotionId: string; count: bigint }>
  >`
    WITH first_use AS (
      SELECT pr."promotionId" AS promotion_id,
             pr."companyId" AS company_id,
             MIN(pr."createdAt") AS used_at
      FROM "PromotionRedemption" pr
      JOIN "Order" o ON o."id" = pr."orderId"
      WHERE ${LIVE_ORDER}
        ${from ? Prisma.sql`AND pr."createdAt" >= ${from}` : Prisma.empty}
      GROUP BY 1, 2
    )
    SELECT fu.promotion_id AS "promotionId",
           COUNT(DISTINCT fu.company_id) AS count
    FROM first_use fu
    WHERE EXISTS (
      SELECT 1 FROM "Order" o
      WHERE o."companyId" = fu.company_id
        AND o."createdAt" > fu.used_at
        AND ${LIVE_ORDER}
    )
    GROUP BY 1
  `;
  return new Map(rows.map((r) => [r.promotionId, Number(r.count)]));
}
