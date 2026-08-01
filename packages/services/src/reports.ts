import { Prisma, prisma } from "@repo/database";
import type { OrderStatus, PaymentMethod } from "@repo/types";
import { Dec, ZERO } from "./money";
import { endOfDay, startOfDay } from "./ledger";

// Read-only reporting over orders, order items and the cari ledger.
// Authorization is the route layer's job; these functions report on whatever
// scope they are handed.

/**
 * Statuses that count as booked revenue. Pending orders are real demand but not
 * yet sales, and cancelled/rejected ones never were — both are reported apart.
 */
export const REVENUE_STATUSES: readonly OrderStatus[] = [
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];

const PENDING_STATUSES: readonly OrderStatus[] = [
  "PENDING_APPROVAL",
  "PENDING_CREDIT",
];

const LOST_STATUSES: readonly OrderStatus[] = ["CANCELLED", "REJECTED"];

export interface ReportScope {
  from?: string;
  to?: string;
  companyId?: string;
  /** Narrow to the companies in one rep's portfolio. */
  salesRepId?: string;
  limit?: number;
}

interface Range {
  from: Date;
  to: Date;
}

/** Default window: the last 30 days, ending today. */
function resolveRange(scope: ReportScope): Range {
  const to = scope.to ? endOfDay(new Date(scope.to)) : endOfDay(new Date());
  const from = scope.from
    ? startOfDay(new Date(scope.from))
    : startOfDay(new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000));
  return { from, to };
}

function orderWhere(scope: ReportScope, range: Range): Prisma.OrderWhereInput {
  return {
    createdAt: { gte: range.from, lte: range.to },
    ...(scope.companyId ? { companyId: scope.companyId } : {}),
    ...(scope.salesRepId ? { company: { salesRepId: scope.salesRepId } } : {}),
  };
}

// ─────────────────────────────────────────────
// SALES SUMMARY
// ─────────────────────────────────────────────

export interface StatusBreakdown {
  status: OrderStatus;
  orderCount: number;
  total: string;
}

export interface DailyPoint {
  date: string; // yyyy-mm-dd, local
  orderCount: number;
  revenue: string;
}

export interface CompanyRevenue {
  companyId: string;
  companyName: string;
  orderCount: number;
  revenue: string;
}

export interface SalesSummary {
  from: string;
  to: string;
  orderCount: number;
  revenue: string;
  averageOrderValue: string;
  /** Placed but not yet confirmed. */
  pendingCount: number;
  pendingTotal: string;
  /** Cancelled + rejected in the same window. */
  lostCount: number;
  lostTotal: string;
  byStatus: StatusBreakdown[];
  daily: DailyPoint[];
  topCompanies: CompanyRevenue[];
}

export async function getSalesSummary(scope: ReportScope = {}): Promise<SalesSummary> {
  const range = resolveRange(scope);
  const where = orderWhere(scope, range);

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      status: true,
      grandTotal: true,
      createdAt: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });

  const byStatusMap = new Map<OrderStatus, { count: number; total: Prisma.Decimal }>();
  const dailyMap = new Map<string, { count: number; revenue: Prisma.Decimal }>();
  const companyMap = new Map<
    string,
    { name: string; count: number; revenue: Prisma.Decimal }
  >();

  let revenue = ZERO;
  let orderCount = 0;
  let pendingCount = 0;
  let pendingTotal = ZERO;
  let lostCount = 0;
  let lostTotal = ZERO;

  for (const o of orders) {
    const bucket = byStatusMap.get(o.status) ?? { count: 0, total: ZERO };
    byStatusMap.set(o.status, {
      count: bucket.count + 1,
      total: bucket.total.plus(o.grandTotal),
    });

    if (PENDING_STATUSES.includes(o.status)) {
      pendingCount++;
      pendingTotal = pendingTotal.plus(o.grandTotal);
      continue;
    }
    if (LOST_STATUSES.includes(o.status)) {
      lostCount++;
      lostTotal = lostTotal.plus(o.grandTotal);
      continue;
    }
    if (!REVENUE_STATUSES.includes(o.status)) continue; // DRAFT

    orderCount++;
    revenue = revenue.plus(o.grandTotal);

    const key = dayKey(o.createdAt);
    const day = dailyMap.get(key) ?? { count: 0, revenue: ZERO };
    dailyMap.set(key, { count: day.count + 1, revenue: day.revenue.plus(o.grandTotal) });

    const c = companyMap.get(o.companyId) ?? {
      name: o.company.name,
      count: 0,
      revenue: ZERO,
    };
    companyMap.set(o.companyId, {
      name: c.name,
      count: c.count + 1,
      revenue: c.revenue.plus(o.grandTotal),
    });
  }

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    orderCount,
    revenue: revenue.toFixed(2),
    averageOrderValue: orderCount
      ? revenue.dividedBy(orderCount).toFixed(2)
      : "0.00",
    pendingCount,
    pendingTotal: pendingTotal.toFixed(2),
    lostCount,
    lostTotal: lostTotal.toFixed(2),
    byStatus: [...byStatusMap.entries()]
      .map(([status, v]) => ({
        status,
        orderCount: v.count,
        total: v.total.toFixed(2),
      }))
      .sort((a, b) => b.orderCount - a.orderCount),
    daily: [...dailyMap.entries()]
      .map(([date, v]) => ({
        date,
        orderCount: v.count,
        revenue: v.revenue.toFixed(2),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topCompanies: [...companyMap.entries()]
      .map(([companyId, v]) => ({
        companyId,
        companyName: v.name,
        orderCount: v.count,
        revenue: v.revenue.toFixed(2),
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
      .slice(0, scope.limit ?? 10),
  };
}

// ─────────────────────────────────────────────
// TOP PRODUCTS
// ─────────────────────────────────────────────

export interface ProductSales {
  variantId: string;
  productName: string;
  sku: string;
  quantity: number;
  revenue: string;
  orderCount: number;
}

export async function getTopProducts(scope: ReportScope = {}): Promise<{
  from: string;
  to: string;
  products: ProductSales[];
}> {
  const range = resolveRange(scope);

  // productName/sku are order-time snapshots, so a renamed product still reports
  // under the name it was actually sold as.
  const items = await prisma.orderItem.findMany({
    where: {
      order: { ...orderWhere(scope, range), status: { in: [...REVENUE_STATUSES] } },
    },
    select: {
      orderId: true,
      variantId: true,
      productName: true,
      sku: true,
      quantity: true,
      lineTotal: true,
    },
  });

  const map = new Map<
    string,
    {
      productName: string;
      sku: string;
      quantity: number;
      revenue: Prisma.Decimal;
      orders: Set<string>;
    }
  >();

  for (const it of items) {
    const cur = map.get(it.variantId) ?? {
      productName: it.productName,
      sku: it.sku,
      quantity: 0,
      revenue: ZERO,
      orders: new Set<string>(),
    };
    cur.quantity += it.quantity;
    cur.revenue = cur.revenue.plus(it.lineTotal);
    cur.orders.add(it.orderId);
    map.set(it.variantId, cur);
  }

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    products: [...map.entries()]
      .map(([variantId, v]) => ({
        variantId,
        productName: v.productName,
        sku: v.sku,
        quantity: v.quantity,
        revenue: v.revenue.toFixed(2),
        orderCount: v.orders.size,
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
      .slice(0, scope.limit ?? 20),
  };
}

// ─────────────────────────────────────────────
// SALES REP PERFORMANCE
// ─────────────────────────────────────────────

export interface RepPerformance {
  salesRepId: string;
  name: string;
  email: string;
  portfolioCount: number;
  /** Orders from the rep's portfolio, whoever actually placed them. */
  orderCount: number;
  revenue: string;
  /** Orders the rep keyed in personally (field sales vs. customer self-service). */
  ownOrderCount: number;
  collections: string;
  collectionCount: number;
  visitCount: number;
  /** Open receivables across the whole portfolio, as of now. */
  portfolioBalance: string;
}

export async function getRepPerformance(scope: ReportScope = {}): Promise<{
  from: string;
  to: string;
  reps: RepPerformance[];
}> {
  const range = resolveRange(scope);

  const reps = await prisma.user.findMany({
    where: { role: "SALES_REP", isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      managedCompanies: { select: { id: true, currentBalance: true } },
    },
    orderBy: { name: "asc" },
  });

  const result: RepPerformance[] = [];

  for (const rep of reps) {
    const companyIds = rep.managedCompanies.map((c) => c.id);
    const created = { gte: range.from, lte: range.to };

    const [orders, ownOrderCount, collections, visitCount] = await Promise.all([
      companyIds.length
        ? prisma.order.findMany({
            where: {
              companyId: { in: companyIds },
              createdAt: created,
              status: { in: [...REVENUE_STATUSES] },
            },
            select: { grandTotal: true },
          })
        : Promise.resolve([]),
      prisma.order.count({
        where: {
          createdById: rep.id,
          createdAt: created,
          status: { in: [...REVENUE_STATUSES] },
        },
      }),
      prisma.transaction.aggregate({
        // orderId null excludes cancellation reversals, which are also CREDIT
        // rows but are not money the rep collected.
        where: {
          recordedById: rep.id,
          type: "CREDIT",
          orderId: null,
          createdAt: created,
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.checkIn.count({
        where: { salesRepId: rep.id, checkInAt: created },
      }),
    ]);

    result.push({
      salesRepId: rep.id,
      name: rep.name,
      email: rep.email,
      portfolioCount: companyIds.length,
      orderCount: orders.length,
      revenue: orders.reduce((a, o) => a.plus(o.grandTotal), ZERO).toFixed(2),
      ownOrderCount,
      collections: new Dec(collections._sum.amount ?? 0).toFixed(2),
      collectionCount: collections._count,
      visitCount,
      portfolioBalance: rep.managedCompanies
        .reduce((a, c) => a.plus(c.currentBalance), ZERO)
        .toFixed(2),
    });
  }

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    reps: result.sort((a, b) => Number(b.revenue) - Number(a.revenue)),
  };
}

// ─────────────────────────────────────────────
// COLLECTIONS (tahsilat)
// ─────────────────────────────────────────────

export interface CollectionRow {
  id: string;
  createdAt: string;
  companyId: string;
  companyName: string;
  amount: string;
  paymentMethod: PaymentMethod | null;
  description: string | null;
  recordedByName: string | null;
}

export interface CollectionsReport {
  from: string;
  to: string;
  total: string;
  count: number;
  byMethod: { paymentMethod: string; count: number; total: string }[];
  byRep: { userId: string; name: string; count: number; total: string }[];
  rows: CollectionRow[];
}

export async function getCollections(
  scope: ReportScope = {},
): Promise<CollectionsReport> {
  const range = resolveRange(scope);

  const rows = await prisma.transaction.findMany({
    where: {
      type: "CREDIT",
      // Real collections only — a cancelled order's reversing CREDIT carries an
      // orderId and would otherwise inflate every collection figure.
      orderId: null,
      createdAt: { gte: range.from, lte: range.to },
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.salesRepId ? { recordedById: scope.salesRepId } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      companyId: true,
      company: { select: { name: true } },
      amount: true,
      paymentMethod: true,
      description: true,
      recordedById: true,
      recordedBy: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const byMethod = new Map<string, { count: number; total: Prisma.Decimal }>();
  const byRep = new Map<string, { name: string; count: number; total: Prisma.Decimal }>();
  let total = ZERO;

  for (const r of rows) {
    total = total.plus(r.amount);

    const mKey = r.paymentMethod ?? "DIGER";
    const m = byMethod.get(mKey) ?? { count: 0, total: ZERO };
    byMethod.set(mKey, { count: m.count + 1, total: m.total.plus(r.amount) });

    if (r.recordedById) {
      const p = byRep.get(r.recordedById) ?? {
        name: r.recordedBy?.name ?? "—",
        count: 0,
        total: ZERO,
      };
      byRep.set(r.recordedById, {
        name: p.name,
        count: p.count + 1,
        total: p.total.plus(r.amount),
      });
    }
  }

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    total: total.toFixed(2),
    count: rows.length,
    byMethod: [...byMethod.entries()].map(([paymentMethod, v]) => ({
      paymentMethod,
      count: v.count,
      total: v.total.toFixed(2),
    })),
    byRep: [...byRep.entries()]
      .map(([userId, v]) => ({
        userId,
        name: v.name,
        count: v.count,
        total: v.total.toFixed(2),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total)),
    rows: rows.slice(0, scope.limit ?? 50).map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      companyId: r.companyId,
      companyName: r.company.name,
      amount: r.amount.toFixed(2),
      paymentMethod: r.paymentMethod,
      description: r.description,
      recordedByName: r.recordedBy?.name ?? null,
    })),
  };
}

/** yyyy-mm-dd in local time — report days must match the operator's calendar. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
