import { Prisma, prisma } from "@repo/database";
import {
  abcClasses,
  businessDaysBetween,
  dayKey,
  dayKeyUtc,
  cagr,
  concentration,
  dso,
  insufficient,
  inventoryTurnover,
  marginBridge,
  marginPct,
  marginRanking,
  MARGIN_MIN_COST_COVERAGE,
  median,
  monthEndProjection,
  movingAverage,
  ok,
  quietCustomers,
  revenueBridge,
  rfm,
  shiftMonth,
  trendSlope,
  trimLeadingEmpty,
  yearOverYear,
  type Indicator,
  type MarginBridge,
  type MarginRow,
  type MarginRowInput,
  type MonthPoint,
  type HolidayMap,
  type QuietInput,
  type RfmRow,
} from "./analytics-math";
import {
  COHORT_WINDOW_DEFAULT,
  RFM_WINDOW_DEFAULT,
  type CohortWindowMonths,
  type RfmWindowDays,
} from "@repo/types";

// Yönetici panosunun veri katmanı.
//
// Dört mimari karar (KALAN-ISLER §6.4), hepsi burada görünür:
//
//  1. **Gecelik özet.** Kohort matrisi, RFM ve ciro köprüsü bütün sipariş
//     geçmişini tarıyor; her sayfa açılışında hesaplanamaz. `computeSnapshot`
//     gecelik iş tarafından çağrılıyor, `readSnapshot` ekran tarafından.
//     **Anlık kutular canlı**: `liveStatus()` doğrudan sorguyor, çünkü dün
//     geceden bir "bugün" olmaz.
//  2. **Toplama SQL'de, matematik JS'te.** Buradaki sorgular `GROUP BY` ile
//     satır sayısını indiriyor; regresyon, kohort, HHI ve segment
//     `analytics-math.ts`te.
//  3. **İzin `analytics.view`, rol değil.** Kapı uç ve sayfa tarafında;
//     buradaki fonksiyonlar kapsamsız çalışıyor çünkü pano satıcının kendi
//     ekibine ait ve kapsamı olan bir "yönetici panosu" zaten yok.
//  4. **Her kutu kaynağına bağlanır.** Servis, ekranın bağlantı kurabilmesi
//     için kimlikleri döndürüyor (firma id, ürün id) — yalnızca sayı dönseydi
//     yönetici sayıya güvenmezdi, ve haklı olurdu.
//
// İki dürüstlük kuralı (§6.5): asgari veri şartları `analytics-math.ts`te
// gösterge başına yazılı, ve varsayılan karşılaştırma **YoY**. MoM hiç
// hesaplanmıyor — gösterilecekse "mevsimsellik arındırılmamış" diye
// işaretlenmesi gerekirdi ve toptan gıdada o uyarı okunmuyor.

/** İptal ve red ciro değil. Her sorguda aynı tanım. */
const LIVE_STATUSES = Prisma.sql`o."status" NOT IN ('CANCELLED', 'REJECTED', 'DRAFT')`;

/** Panonun kaç aylık geçmişe baktığı. */
const HISTORY_MONTHS = 24;

// ─────────────────────────────────────────────
// ANLIK DURUM — canlı
// ─────────────────────────────────────────────

export interface LiveStatus {
  monthRevenue: number;
  lastYearSameMonthRevenue: number | null;
  yoyChangePct: number | null;
  openOrderCount: number;
  awaitingShipmentCount: number;
  receivableTotal: number;
  overdueTotal: number;
  cashTotal: number;
  chequesDueThisMonth: number;
  stockValueAtCost: number;
  /** Maliyet kapsamı yetersizse `null` — bkz. `costCoveragePct`. */
  grossMarginPct: number | null;
  monthCogs: number;
  /** Bu ayın cirosunun yüzde kaçı alış fiyatı girilmiş üründen geliyor. */
  costCoveragePct: number | null;
  variantsWithoutCost: number;
}

export async function liveStatus(now = new Date()): Promise<LiveStatus> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);

  const [
    thisMonth,
    lastYear,
    counts,
    receivables,
    cash,
    cheques,
    stock,
    cost,
    noCost,
  ] = await Promise.all([
    sumRevenue(monthStart, nextMonth),
    sumRevenue(lastYearStart, lastYearEnd),
    orderCounts(),
    receivableTotals(now),
    cashTotal(),
    chequesDue(monthStart, nextMonth),
    stockValue(),
    monthCost(monthStart, nextMonth),
    variantsWithoutCost(),
  ]);

  const costCoveragePct =
    thisMonth > 0 ? (cost.coveredRevenue / thisMonth) * 100 : null;
  const grossMarginPct =
    thisMonth > 0 &&
    costCoveragePct !== null &&
    costCoveragePct >= MARGIN_MIN_COST_COVERAGE
      ? ((thisMonth - cost.cogs) / thisMonth) * 100
      : null;

  return {
    monthRevenue: thisMonth,
    lastYearSameMonthRevenue: lastYear > 0 ? lastYear : null,
    yoyChangePct:
      lastYear > 0 ? ((thisMonth - lastYear) / lastYear) * 100 : null,
    ...counts,
    ...receivables,
    cashTotal: cash,
    chequesDueThisMonth: cheques,
    stockValueAtCost: stock,
    grossMarginPct,
    monthCogs: cost.cogs,
    costCoveragePct,
    variantsWithoutCost: noCost,
  };
}

async function sumRevenue(from: Date, to: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM(o."grandTotal"), 0)::float8 AS total
    FROM "Order" o
    WHERE ${LIVE_STATUSES}
      AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
  `;
  return rows[0]?.total ?? 0;
}

async function orderCounts(): Promise<{
  openOrderCount: number;
  awaitingShipmentCount: number;
}> {
  const rows = await prisma.$queryRaw<
    Array<{ open: bigint; awaiting: bigint }>
  >`
    SELECT
      COUNT(*) FILTER (
        WHERE o."status" IN ('PENDING_APPROVAL', 'PENDING_CREDIT', 'CONFIRMED', 'PROCESSING')
      ) AS open,
      COUNT(*) FILTER (WHERE o."status" IN ('CONFIRMED', 'PROCESSING')) AS awaiting
    FROM "Order" o
  `;
  return {
    openOrderCount: Number(rows[0]?.open ?? 0),
    awaitingShipmentCount: Number(rows[0]?.awaiting ?? 0),
  };
}

/**
 * Alacak ve vadesi geçen.
 *
 * Bakiye firmanın kendi kolonundan okunuyor (defterin özeti orada tutuluyor);
 * vadesi geçen ise borç satırlarından, ödemeler düşülerek. Bu, ekstredeki FIFO
 * mahsubun kabaca aynısı — kuruşuna kadar aynısı değil ve pano için de gerekli
 * değil: burada okunacak şey büyüklük sırası.
 */
async function receivableTotals(
  now: Date,
): Promise<{ receivableTotal: number; overdueTotal: number }> {
  const rows = await prisma.$queryRaw<
    Array<{ receivable: number | null; overdue: number | null }>
  >`
    WITH ledger AS (
      SELECT
        t."companyId",
        SUM(CASE WHEN t."type" = 'DEBIT' THEN t."amount" ELSE -t."amount" END) AS balance,
        SUM(
          CASE
            WHEN t."type" = 'DEBIT'
             AND COALESCE(t."dueDate", t."createdAt") < ${now}
            THEN t."amount" ELSE 0
          END
        ) AS due,
        SUM(CASE WHEN t."type" = 'CREDIT' THEN t."amount" ELSE 0 END) AS paid
      FROM "Transaction" t
      GROUP BY t."companyId"
    )
    SELECT
      COALESCE(SUM(GREATEST(balance, 0)), 0)::float8 AS receivable,
      COALESCE(SUM(GREATEST(LEAST(due - paid, balance), 0)), 0)::float8 AS overdue
    FROM ledger
  `;
  return {
    receivableTotal: rows[0]?.receivable ?? 0,
    overdueTotal: rows[0]?.overdue ?? 0,
  };
}

async function cashTotal(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM(a."currentBalance"), 0)::float8 AS total
    FROM "CashAccount" a WHERE a."isActive" = true
  `;
  return rows[0]?.total ?? 0;
}

async function chequesDue(from: Date, to: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM(c."amount"), 0)::float8 AS total
    FROM "Cheque" c
    WHERE c."status" IN ('PORTFOLIO', 'DEPOSITED')
      AND c."dueDate" >= ${from} AND c."dueDate" < ${to}
  `;
  return rows[0]?.total ?? 0;
}

/**
 * Maliyetle stok değeri.
 *
 * `costPrice` boş olan varyant sıfır sayılıyor, tahmin edilmiyor: eksik
 * maliyeti ortalama ile doldurmak, stok değerini uydurmak olur. Ekran kaç
 * varyantın maliyetsiz olduğunu da gösteriyor.
 */
async function stockValue(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM(v."stock" * COALESCE(v."costPrice", 0)), 0)::float8 AS total
    FROM "ProductVariant" v WHERE v."isActive" = true
  `;
  return rows[0]?.total ?? 0;
}

/**
 * Satılan malın maliyeti — ve o maliyetin ne kadar cirosu kapsadığı.
 *
 * İkisi birlikte dönüyor çünkü ilki ikincisi olmadan okunamaz: maliyeti
 * girilmemiş ürün sıfır maliyetli sayılıyor ve marjı yukarı şişiriyor.
 */
async function monthCost(
  from: Date,
  to: Date,
): Promise<{ cogs: number; coveredRevenue: number }> {
  const rows = await prisma.$queryRaw<
    Array<{ cogs: number | null; covered: number | null }>
  >`
    SELECT
      COALESCE(SUM(oi."quantity" * COALESCE(v."costPrice", 0)), 0)::float8 AS cogs,
      COALESCE(SUM(oi."lineTotal") FILTER (WHERE COALESCE(v."costPrice", 0) > 0), 0)::float8 AS covered
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "ProductVariant" v ON v."id" = oi."variantId"
    WHERE ${LIVE_STATUSES}
      AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
  `;
  return {
    cogs: rows[0]?.cogs ?? 0,
    coveredRevenue: rows[0]?.covered ?? 0,
  };
}

async function variantsWithoutCost(): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count FROM "ProductVariant"
    WHERE "isActive" = true AND ("costPrice" IS NULL OR "costPrice" = 0)
  `;
  return Number(row?.count ?? 0);
}

// ─────────────────────────────────────────────
// GİDİŞAT — canlı
// ─────────────────────────────────────────────

export interface Pace {
  achieved: number;
  businessDaysElapsed: number;
  businessDaysInMonth: number;
  projection: number | null;
  seasonalIndex: number | null;
  targetTotal: number | null;
  targetAchievedPct: number | null;
  /**
   * Bu ayın iş gününden düşülen resmî tatiller. Ekran bunu yazıyor: sıfırsa
   * "tatil takvimi girilmemiş" uyarısı duruyor, doluysa hangi günler olduğu
   * görünüyor — tahminin neden düştüğü sorulacak bir soru.
   */
  holidays: Array<{ date: string; name: string; halfDay: boolean }>;
}

export async function pace(now = new Date()): Promise<Pace> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Tatiller iki dönem için lazım: bu ay (iş günü sayacı) ve geçen yılın aynı
  // ayı (mevsimsel indeksin kestiği nokta). İkisi tek sorguda iniyor.
  const lastYearFrom = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const holidayRows = await listHolidaysBetween(lastYearFrom, monthEnd);
  const holidays = holidayMapOf(holidayRows);
  const achieved = await sumRevenue(
    monthStart,
    new Date(now.getFullYear(), now.getMonth() + 1, 1),
  );

  // Mevsimsel indeks: geçen yılın aynı ayında, aynı iş günü noktasında cironun
  // ne kadarı yapılmıştı. Yoksa doğrusal tahmine düşülüyor.
  const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const lastYearNext = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
  const businessDaysElapsed = businessDaysBetween(monthStart, now, holidays);
  const businessDaysInMonth = businessDaysBetween(monthStart, monthEnd, holidays);

  const lastYearTotal = await sumRevenue(lastYearStart, lastYearNext);
  let seasonalIndex: number | null = null;
  if (lastYearTotal > 0) {
    const cutoff = nthBusinessDay(lastYearStart, businessDaysElapsed, holidays);
    const partial = await sumRevenue(lastYearStart, cutoff);
    seasonalIndex = partial / lastYearTotal;
  }

  const targets = await prisma.salesTarget.aggregate({
    where: { metric: "REVENUE", period: "MONTHLY", periodStart: monthStart },
    _sum: { targetValue: true },
  });
  const targetTotal = Number(targets._sum.targetValue ?? 0) || null;

  return {
    achieved,
    businessDaysElapsed,
    businessDaysInMonth,
    projection: monthEndProjection({
      achieved,
      businessDaysElapsed,
      businessDaysInMonth,
      seasonalIndex,
    }),
    seasonalIndex,
    targetTotal,
    targetAchievedPct: targetTotal ? (achieved / targetTotal) * 100 : null,
    // Ekranda **gerçekten düşülen** günler yazıyor. Hafta sonuna denk gelen
    // tatil iş gününü zaten düşürmüyor; onu da listeye koymak "1,5 gün
    // düşüldü" derken 0,5 düşmek olurdu — sayının kendisi doğru, cümlesi
    // yalan.
    holidays: holidayRows
      .filter(
        (h) =>
          h.date >= utcDay(monthStart) &&
          h.date <= utcDay(monthEnd) &&
          !isWeekendUtc(h.date),
      )
      .map((h) => ({
        date: dayKeyUtc(h.date),
        name: h.name,
        halfDay: h.halfDay,
      })),
  };
}

/**
 * Tatil satırları.
 *
 * Sınırlar **UTC gününe** çevriliyor: kolon `DATE` ve sürücü onu UTC gece
 * yarısı olarak tutuyor. Yerel gece yarısıyla sorulsaydı UTC+3'te ayın ilk
 * günü aralığın dışında kalırdı.
 */
export async function listHolidaysBetween(
  from: Date,
  to: Date,
): Promise<Array<{ date: Date; name: string; halfDay: boolean }>> {
  return prisma.holiday.findMany({
    where: { date: { gte: utcDay(from), lte: utcDay(to) } },
    orderBy: { date: "asc" },
    select: { date: true, name: true, halfDay: true },
  });
}

/**
 * Satırları sayacın anlayacağı haritaya çeviriyor.
 *
 * Anahtar `dayKeyUtc` ile üretiliyor (disk tarafı), sayaç `dayKey` ile arıyor
 * (takvim tarafı) — ikisi de aynı takvim gününü aynı dizeye çeviriyor.
 */
export function holidayMapOf(
  rows: ReadonlyArray<{ date: Date; halfDay: boolean }>,
): HolidayMap {
  return new Map(rows.map((r) => [dayKeyUtc(r.date), r.halfDay]));
}

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** `DATE` kolonundan gelen gün hafta sonuna mı düşüyor. */
function isWeekendUtc(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Ayın n'inci iş gününün ertesi (üst sınır olarak kullanılıyor).
 *
 * Tatil takvimini `businessDaysBetween` ile aynı şekilde sayıyor — biri
 * sayarken tatili düşüp diğeri düşmeseydi mevsimsel indeks yanlış noktadan
 * kesilirdi. `n` kesirli olabilir (arife 0,5 sayılıyor).
 */
function nthBusinessDay(monthStart: Date, n: number, holidays?: HolidayMap): Date {
  const cursor = new Date(monthStart);
  const guard = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  let counted = 0;
  while (counted < n && cursor < guard) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const half = holidays?.get(dayKey(cursor));
      counted += half === undefined ? 1 : half ? 0.5 : 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return cursor;
}

// ─────────────────────────────────────────────
// GECELİK ÖZET
// ─────────────────────────────────────────────

export interface GrowthSnapshot {
  months: MonthPoint[];
  movingAverage: Array<{ month: string; value: number | null }>;
  yoy: ReturnType<typeof yearOverYear>;
  slope: Indicator<number>;
  cagr: Indicator<number>;
  bridge: ReturnType<typeof revenueBridge> & {
    previousLabel: string;
    currentLabel: string;
  };
}

export interface CustomerSnapshot {
  /** Bu sayıların hangi pencereden çıktığı; ekran başlıkta bunu yazıyor. */
  windows: CustomerWindows;
  rfm: Indicator<RfmRow[]>;
  segmentCounts: Record<string, number>;
  cohorts: Array<{ cohort: string; size: number; retention: Array<number | null> }>;
  concentration: ReturnType<typeof concentration>;
  topCompanies: Array<{ companyId: string; companyName: string; revenue: number }>;
  quiet: ReturnType<typeof quietCustomers>;
}

export interface ProductSnapshot {
  abc: Array<{
    productId: string;
    productName: string;
    revenue: number;
    cost: number;
    marginPct: number | null;
    quantity: number;
    abc: "A" | "B" | "C";
    cumulativePct: number;
  }>;
  turnover: { turnover: number; dioDays: number } | null;
  deadStock: Array<{
    variantId: string;
    productId: string;
    sku: string;
    productName: string;
    stock: number;
    costValue: number;
    lastMovementAt: string | null;
  }>;
  variantsWithoutCost: number;
}

export interface CashSnapshot {
  dsoDays: number | null;
  agingTrend: Array<{ month: string; overdue: number; total: number }>;
  /** Vadesi geçmiş borcun toplam alacağa oranı. */
  overdueSharePct: number | null;
  /**
   * Ortalama gecikme — **yaklaşık.** Borç satırı ile onu kapatan tahsilat
   * kuruşuna kadar eşlenmiyor (ekstredeki FIFO mahsup o işi yapıyor); burada
   * her borcun vadesine en yakın tahsilat bakılıyor. Pano bir mutabakat
   * belgesi değil, büyüklük sırası veren bir gösterge.
   */
  averageDelayDays: number | null;
  chequeCalendar: Array<{ weekStart: string; amount: number; count: number }>;
  /** On kâğıttan azında `null` — oran gürültü olurdu. */
  bouncedPct: number | null;
  bouncedSample: number;
  slowPayers: Array<{
    companyId: string;
    companyName: string;
    averageDelayDays: number;
    paidCount: number;
  }>;
}

export interface AnalyticsSnapshotPayload {
  growth: GrowthSnapshot;
  customers: CustomerSnapshot;
  products: ProductSnapshot;
  cash: CashSnapshot;
  margin: MarginSnapshot;
}

/** Gecelik iş bunu çağırıyor; ekran `readSnapshot` ile okuyor. */
export async function computeSnapshot(
  now = new Date(),
): Promise<AnalyticsSnapshotPayload> {
  const [growth, customers, products, cash, margin] = await Promise.all([
    computeGrowth(now),
    computeCustomers(now),
    computeProducts(now),
    computeCash(now),
    computeMargin(now),
  ]);
  return { growth, customers, products, cash, margin };
}

export async function saveSnapshot(
  payload: AnalyticsSnapshotPayload,
  durationMs: number,
): Promise<void> {
  const rows = Object.entries(payload);
  for (const [key, value] of rows) {
    await prisma.analyticsSnapshot.upsert({
      where: { key },
      update: {
        payload: value as unknown as Prisma.InputJsonValue,
        computedAt: new Date(),
        durationMs: Math.round(durationMs / rows.length),
      },
      create: {
        key,
        payload: value as unknown as Prisma.InputJsonValue,
        durationMs: Math.round(durationMs / rows.length),
      },
    });
  }
}

export interface StoredSection<T> {
  data: T | null;
  computedAt: string | null;
}

export async function readSnapshot<K extends keyof AnalyticsSnapshotPayload>(
  key: K,
): Promise<StoredSection<AnalyticsSnapshotPayload[K]>> {
  const row = await prisma.analyticsSnapshot.findUnique({ where: { key } });
  if (!row) return { data: null, computedAt: null };
  return {
    data: row.payload as unknown as AnalyticsSnapshotPayload[K],
    computedAt: row.computedAt.toISOString(),
  };
}

// ── büyüme ──────────────────────────────────────────────────────────────────

async function computeGrowth(now: Date): Promise<GrowthSnapshot> {
  const from = new Date(now.getFullYear(), now.getMonth() - HISTORY_MONTHS + 1, 1);

  const rows = await prisma.$queryRaw<Array<{ month: string; total: number }>>`
    SELECT to_char(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM') AS month,
           SUM(o."grandTotal")::float8 AS total
    FROM "Order" o
    WHERE ${LIVE_STATUSES} AND o."createdAt" >= ${from}
    GROUP BY 1
    ORDER BY 1
  `;

  // Aradaki boş aylar sıfırla dolduruluyor (eksik ay seride bir delik değil bir
  // sıfır), ama **baştaki** boşlar atılıyor: kurulum iki ay önce açıldıysa
  // öncesindeki yirmi iki sıfır eğimi de hareketli ortalamayı da aşağı çeker.
  const months = trimLeadingEmpty(
    fillMonths(rows.map((r) => ({ month: r.month, value: r.total })), from, now),
  );

  // Köprü: son tam ay ile bir önceki tam ay.
  const currentLabel = shiftMonth(monthKey(now), -1);
  const previousLabel = shiftMonth(currentLabel, -1);
  const bridgeRows = await companyRevenueForMonths([previousLabel, currentLabel]);

  return {
    months,
    movingAverage: movingAverage(months, 3),
    yoy: yearOverYear(months),
    slope: trendSlope(months),
    cagr: cagr(months),
    bridge: { ...revenueBridge(bridgeRows), previousLabel, currentLabel },
  };
}

const REPORT_TZ = process.env.REPORT_TIMEZONE ?? "Europe/Istanbul";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

function fillMonths(
  rows: readonly MonthPoint[],
  from: Date,
  to: Date,
): MonthPoint[] {
  const map = new Map(rows.map((r) => [r.month, r.value]));
  const out: MonthPoint[] = [];
  let cursor = monthKey(from);
  const end = monthKey(to);
  for (let i = 0; i < HISTORY_MONTHS + 1; i += 1) {
    out.push({ month: cursor, value: map.get(cursor) ?? 0 });
    if (cursor === end) break;
    cursor = shiftMonth(cursor, 1);
  }
  return out;
}

async function companyRevenueForMonths(
  months: [string, string],
): Promise<Array<{ companyId: string; previous: number; current: number }>> {
  const rows = await prisma.$queryRaw<
    Array<{ companyId: string; month: string; total: number }>
  >`
    SELECT o."companyId" AS "companyId",
           to_char(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM') AS month,
           SUM(o."grandTotal")::float8 AS total
    FROM "Order" o
    WHERE ${LIVE_STATUSES}
      AND to_char(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM') IN (${months[0]}, ${months[1]})
    GROUP BY 1, 2
  `;

  const byCompany = new Map<string, { previous: number; current: number }>();
  for (const r of rows) {
    const entry = byCompany.get(r.companyId) ?? { previous: 0, current: 0 };
    if (r.month === months[0]) entry.previous += r.total;
    else entry.current += r.total;
    byCompany.set(r.companyId, entry);
  }
  return [...byCompany.entries()].map(([companyId, v]) => ({ companyId, ...v }));
}

// ── müşteri ─────────────────────────────────────────────────────────────────

/**
 * Müşteri bölümünün iki penceresi (§6.4).
 *
 * Eskiden sabitti (365 gün / 12 ay); artık ekranın süzgeci. **Gecelik özet
 * yalnızca varsayılanı hesaplıyor** — üç RFM x üç kohort penceresini her gece
 * hesaplamak dokuz kat iş demekti ve dokuzunun sekizi hiç açılmayacaktı.
 * Varsayılan dışı bir pencere seçildiğinde uç bu fonksiyonu **canlı**
 * çağırıyor: sorgu pencereyle sınırlı, ve cevap "canlı" diye işaretleniyor
 * (bkz. api/analytics/route.ts).
 */
export interface CustomerWindows {
  rfmWindowDays: RfmWindowDays;
  cohortMonths: CohortWindowMonths;
}

export const CUSTOMER_WINDOWS_DEFAULT: CustomerWindows = {
  rfmWindowDays: RFM_WINDOW_DEFAULT,
  cohortMonths: COHORT_WINDOW_DEFAULT,
};

export function isDefaultCustomerWindows(w: CustomerWindows): boolean {
  return (
    w.rfmWindowDays === CUSTOMER_WINDOWS_DEFAULT.rfmWindowDays &&
    w.cohortMonths === CUSTOMER_WINDOWS_DEFAULT.cohortMonths
  );
}

/** Varsayılan dışı pencere için ekranın çağırdığı canlı yol. */
export function computeCustomerWindow(
  windows: CustomerWindows,
  now = new Date(),
): Promise<CustomerSnapshot> {
  return computeCustomers(now, windows);
}

async function computeCustomers(
  now: Date,
  windows: CustomerWindows = CUSTOMER_WINDOWS_DEFAULT,
): Promise<CustomerSnapshot> {
  const { rfmWindowDays, cohortMonths } = windows;
  const windowStart = new Date(now.getTime() - rfmWindowDays * 86_400_000);

  const rows = await prisma.$queryRaw<
    Array<{
      companyId: string;
      companyName: string;
      orders: bigint;
      revenue: number;
      lastOrderAt: Date | null;
    }>
  >`
    SELECT c."id" AS "companyId", c."name" AS "companyName",
           COUNT(o."id") AS orders,
           COALESCE(SUM(o."grandTotal"), 0)::float8 AS revenue,
           MAX(o."createdAt") AS "lastOrderAt"
    FROM "Company" c
    LEFT JOIN "Order" o
      ON o."companyId" = c."id" AND ${LIVE_STATUSES} AND o."createdAt" >= ${windowStart}
    WHERE c."isActive" = true
    GROUP BY 1, 2
  `;

  const active = rows.filter((r) => Number(r.orders) > 0);
  const rfmResult = rfm(
    active.map((r) => ({
      companyId: r.companyId,
      companyName: r.companyName,
      recencyDays: r.lastOrderAt
        ? Math.floor((now.getTime() - r.lastOrderAt.getTime()) / 86_400_000)
        : rfmWindowDays,
      frequency: Number(r.orders),
      monetary: r.revenue,
    })),
  );

  const segmentCounts: Record<string, number> = {};
  if (rfmResult.ok) {
    for (const row of rfmResult.value) {
      segmentCounts[row.segment] = (segmentCounts[row.segment] ?? 0) + 1;
    }
  }

  const topCompanies = [...active]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15)
    .map((r) => ({
      companyId: r.companyId,
      companyName: r.companyName,
      revenue: r.revenue,
    }));

  return {
    windows,
    rfm: rfmResult,
    segmentCounts,
    cohorts: await computeCohorts(now, cohortMonths),
    concentration: concentration(active.map((r) => r.revenue)),
    topCompanies,
    quiet: quietCustomers(await quietInputs(now)),
  };
}

/**
 * Kohort tutundurma: ilk siparişini şu ayda veren firmaların kaçta kaçı
 * sonraki aylarda hâlâ alıyor.
 *
 * Satırlar ay, sütunlar "kaçıncı ay". Hücre yüzde değil oran (0–1); biçim
 * ekranın işi.
 */
async function computeCohorts(
  now: Date,
  cohortMonths: CohortWindowMonths,
): Promise<Array<{ cohort: string; size: number; retention: Array<number | null> }>> {
  const from = new Date(now.getFullYear(), now.getMonth() - cohortMonths + 1, 1);

  const rows = await prisma.$queryRaw<
    Array<{ cohort: string; month: string; companyId: string }>
  >`
    WITH firsts AS (
      SELECT o."companyId" AS company_id,
             to_char(MIN(o."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM') AS cohort
      FROM "Order" o
      WHERE ${LIVE_STATUSES}
      GROUP BY 1
    )
    SELECT f.cohort AS cohort,
           to_char(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM') AS month,
           o."companyId" AS "companyId"
    FROM "Order" o
    JOIN firsts f ON f.company_id = o."companyId"
    WHERE ${LIVE_STATUSES} AND f.cohort >= ${monthKey(from)}
    GROUP BY 1, 2, 3
  `;

  const cohorts = new Map<string, Map<number, Set<string>>>();
  const sizes = new Map<string, Set<string>>();

  for (const r of rows) {
    const offset = monthDiff(r.cohort, r.month);
    if (offset < 0) continue;
    if (!cohorts.has(r.cohort)) cohorts.set(r.cohort, new Map());
    const byOffset = cohorts.get(r.cohort)!;
    if (!byOffset.has(offset)) byOffset.set(offset, new Set());
    byOffset.get(offset)!.add(r.companyId);
    if (offset === 0) {
      if (!sizes.has(r.cohort)) sizes.set(r.cohort, new Set());
      sizes.get(r.cohort)!.add(r.companyId);
    }
  }

  const currentMonth = monthKey(now);
  return [...cohorts.keys()]
    .sort()
    .map((cohort) => {
      const size = sizes.get(cohort)?.size ?? 0;
      const span = monthDiff(cohort, currentMonth);
      const retention: Array<number | null> = [];
      for (let i = 0; i <= Math.min(span, cohortMonths - 1); i += 1) {
        const active = cohorts.get(cohort)?.get(i)?.size ?? 0;
        retention.push(size === 0 ? null : active / size);
      }
      return { cohort, size, retention };
    })
    .filter((c) => c.size > 0);
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty! - fy!) * 12 + (tm! - fm!);
}

async function quietInputs(now: Date): Promise<QuietInput[]> {
  const rows = await prisma.$queryRaw<
    Array<{ companyId: string; companyName: string; createdAt: Date }>
  >`
    SELECT o."companyId" AS "companyId", c."name" AS "companyName", o."createdAt" AS "createdAt"
    FROM "Order" o
    JOIN "Company" c ON c."id" = o."companyId"
    WHERE ${LIVE_STATUSES} AND c."isActive" = true
    ORDER BY o."companyId", o."createdAt"
  `;

  const byCompany = new Map<string, { name: string; dates: Date[] }>();
  for (const r of rows) {
    const entry = byCompany.get(r.companyId) ?? { name: r.companyName, dates: [] };
    entry.dates.push(r.createdAt);
    byCompany.set(r.companyId, entry);
  }

  return [...byCompany.entries()].map(([companyId, { name, dates }]) => {
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      gaps.push((dates[i]!.getTime() - dates[i - 1]!.getTime()) / 86_400_000);
    }
    const last = dates[dates.length - 1]!;
    return {
      companyId,
      companyName: name,
      orderCount: dates.length,
      medianIntervalDays: median(gaps),
      daysSinceLastOrder: (now.getTime() - last.getTime()) / 86_400_000,
      lastOrderAt: last.toISOString(),
    };
  });
}

// ── ürün ────────────────────────────────────────────────────────────────────

const DEAD_STOCK_DAYS = 90;

/**
 * Ürün bölümünün penceresi — bir yıl, ve **sabit**.
 *
 * Eskiden RFM sabitini paylaşıyordu. Paylaşmaması gerekiyordu: RFM penceresi
 * artık ekranın süzgeci (§6.4) ve "son 90 günün müşteri segmenti" sorusu ABC
 * sınıflandırmasının penceresini değiştirmemeli. Aynı sayı, ayrı sebep.
 */
const PRODUCT_WINDOW_DAYS = 365;

/** Karşılıksız oranının yazılabilmesi için gereken kâğıt sayısı. */
export const BOUNCED_MIN_SAMPLE = 10;

async function computeProducts(now: Date): Promise<ProductSnapshot> {
  const windowStart = new Date(now.getTime() - PRODUCT_WINDOW_DAYS * 86_400_000);

  const rows = await prisma.$queryRaw<
    Array<{
      productId: string;
      productName: string;
      revenue: number;
      cost: number;
      quantity: bigint;
    }>
  >`
    SELECT p."id" AS "productId", p."name" AS "productName",
           SUM(oi."lineTotal")::float8 AS revenue,
           SUM(oi."quantity" * COALESCE(v."costPrice", 0))::float8 AS cost,
           SUM(oi."quantity") AS quantity
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "ProductVariant" v ON v."id" = oi."variantId"
    JOIN "Product" p ON p."id" = v."productId"
    WHERE ${LIVE_STATUSES} AND o."createdAt" >= ${windowStart}
    GROUP BY 1, 2
  `;

  const abc = abcClasses(
    rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      revenue: r.revenue,
      cost: r.cost,
      quantity: Number(r.quantity),
      marginPct: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : null,
    })),
  );

  const [cogsRow] = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM(oi."quantity" * COALESCE(v."costPrice", 0)), 0)::float8 AS total
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "ProductVariant" v ON v."id" = oi."variantId"
    WHERE ${LIVE_STATUSES} AND o."createdAt" >= ${windowStart}
  `;
  const stockNow = await stockValue();

  const dead = await prisma.$queryRaw<
    Array<{
      variantId: string;
      productId: string;
      sku: string;
      productName: string;
      stock: number;
      costValue: number;
      lastMovementAt: Date | null;
    }>
  >`
    SELECT v."id" AS "variantId", v."productId" AS "productId", v."sku" AS sku,
           p."name" AS "productName", v."stock" AS stock,
           (v."stock" * COALESCE(v."costPrice", 0))::float8 AS "costValue",
           MAX(m."occurredAt") AS "lastMovementAt"
    FROM "ProductVariant" v
    JOIN "Product" p ON p."id" = v."productId"
    LEFT JOIN "StockMovement" m ON m."variantId" = v."id"
    WHERE v."isActive" = true AND v."stock" > 0
    GROUP BY 1, 2, 3, 4, 5, 6
    HAVING MAX(m."occurredAt") IS NULL
        OR MAX(m."occurredAt") < ${new Date(now.getTime() - DEAD_STOCK_DAYS * 86_400_000)}
    ORDER BY 6 DESC
    LIMIT 25
  `;

  return {
    abc,
    turnover: inventoryTurnover(cogsRow?.total ?? 0, stockNow),
    deadStock: dead.map((d) => ({
      ...d,
      lastMovementAt: d.lastMovementAt?.toISOString() ?? null,
    })),
    variantsWithoutCost: await variantsWithoutCost(),
  };
}

// ── kârlılık ────────────────────────────────────────────────────────────────

/**
 * Kârlılığın penceresi — bir yıl, ürün bölümüyle aynı sebeple.
 *
 * Marj mevsimlik oynuyor: ramazan öncesi iskonto artar, okul döneminde
 * kampanya biter. Üç aylık bir pencerede "marj düştü" cümlesi çoğu zaman
 * mevsimin kendisidir. Aylık seri yine de ayrı duruyor — trendi orada
 * okuyacaksınız, tek sayıda değil.
 */
const MARGIN_WINDOW_DAYS = 365;

/** Aylık marj serisinin uzunluğu. */
const MARGIN_TREND_MONTHS = 12;

/** Alış fiyatı **girilmiş** varyant: `NULL` da `0` da girilmiş sayılmıyor. */
const HAS_COST = Prisma.sql`v."costPrice" IS NOT NULL AND v."costPrice" > 0`;

export interface MarginSnapshot {
  windowDays: number;
  bridge: MarginBridge;
  /** Aylık net ciro, maliyet ve marj — kapsam yetmeyen ay `null`. */
  trend: Array<{
    month: string;
    netRevenue: number;
    cost: number;
    marginPct: number | null;
  }>;
  byCompany: { rows: MarginRow[]; excluded: number };
  byCategory: { rows: MarginRow[]; excluded: number };
  /**
   * Plasiyer kırılımı — "kim ne kadar iskonto dağıttı".
   *
   * Yalnızca `SALES_REP` rolündeki kullanıcının girdiği siparişler: bayinin
   * portaldan kendi girdiği sipariş kimsenin performansı değil.
   */
  byRep: { rows: MarginRow[]; excluded: number };
}

async function computeMargin(now: Date): Promise<MarginSnapshot> {
  const windowStart = new Date(now.getTime() - MARGIN_WINDOW_DAYS * 86_400_000);
  const trendStart = new Date(
    now.getFullYear(),
    now.getMonth() - MARGIN_TREND_MONTHS + 1,
    1,
  );

  // Tek `SELECT` listesi dört sorguda da aynı: liste bedeli, üç iskonto
  // kalemi, net, maliyet ve kapsanan ciro. Farklı olan yalnızca `GROUP BY`.
  const totals = Prisma.sql`
    SUM(oi."quantity" * oi."unitPrice")::float8 AS "listValue",
    SUM(oi."quantity" * (oi."discount" - oi."volumeDiscount"))::float8 AS "companyDiscount",
    SUM(oi."quantity" * oi."volumeDiscount")::float8 AS "volumeDiscount",
    SUM(oi."promotionDiscount")::float8 AS "promotionDiscount",
    SUM(oi."lineTotal")::float8 AS "netRevenue",
    SUM(oi."quantity" * COALESCE(v."costPrice", 0))::float8 AS cost,
    SUM(CASE WHEN ${HAS_COST} THEN oi."lineTotal" ELSE 0 END)::float8 AS "coveredRevenue"
  `;

  const [head] = await prisma.$queryRaw<
    Array<{
      listValue: number | null;
      companyDiscount: number | null;
      volumeDiscount: number | null;
      promotionDiscount: number | null;
      netRevenue: number | null;
      cost: number | null;
      coveredRevenue: number | null;
    }>
  >`
    SELECT ${totals}
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "ProductVariant" v ON v."id" = oi."variantId"
    WHERE ${LIVE_STATUSES} AND o."createdAt" >= ${windowStart}
  `;

  const trendRows = await prisma.$queryRaw<
    Array<{ month: string; netRevenue: number; cost: number; coveredRevenue: number }>
  >`
    SELECT to_char(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM') AS month,
           SUM(oi."lineTotal")::float8 AS "netRevenue",
           SUM(oi."quantity" * COALESCE(v."costPrice", 0))::float8 AS cost,
           SUM(CASE WHEN ${HAS_COST} THEN oi."lineTotal" ELSE 0 END)::float8 AS "coveredRevenue"
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "ProductVariant" v ON v."id" = oi."variantId"
    WHERE ${LIVE_STATUSES} AND o."createdAt" >= ${trendStart}
    GROUP BY 1 ORDER BY 1
  `;

  const [companies, categories, reps] = await Promise.all([
    prisma.$queryRaw<MarginGroupRow[]>`
      SELECT c."id" AS key, c."name" AS label, COUNT(DISTINCT o."id") AS "orderCount", ${totals}
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      JOIN "ProductVariant" v ON v."id" = oi."variantId"
      JOIN "Company" c ON c."id" = o."companyId"
      WHERE ${LIVE_STATUSES} AND o."createdAt" >= ${windowStart}
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<MarginGroupRow[]>`
      SELECT cat."id" AS key, cat."name" AS label, COUNT(DISTINCT o."id") AS "orderCount", ${totals}
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      JOIN "ProductVariant" v ON v."id" = oi."variantId"
      JOIN "Product" p ON p."id" = v."productId"
      JOIN "Category" cat ON cat."id" = p."categoryId"
      WHERE ${LIVE_STATUSES} AND o."createdAt" >= ${windowStart}
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<MarginGroupRow[]>`
      SELECT u."id" AS key, u."name" AS label, COUNT(DISTINCT o."id") AS "orderCount", ${totals}
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      JOIN "ProductVariant" v ON v."id" = oi."variantId"
      JOIN "User" u ON u."id" = o."createdById"
      WHERE ${LIVE_STATUSES} AND o."createdAt" >= ${windowStart}
        AND u."role" = 'SALES_REP'
      GROUP BY 1, 2
    `,
  ]);

  return {
    windowDays: MARGIN_WINDOW_DAYS,
    bridge: marginBridge({
      listValue: head?.listValue ?? 0,
      companyDiscount: head?.companyDiscount ?? 0,
      volumeDiscount: head?.volumeDiscount ?? 0,
      promotionDiscount: head?.promotionDiscount ?? 0,
      netRevenue: head?.netRevenue ?? 0,
      cost: head?.cost ?? 0,
      coveredRevenue: head?.coveredRevenue ?? 0,
    }),
    trend: trendRows.map((r) => {
      const pct = marginPct(r.netRevenue, r.cost, r.coveredRevenue);
      return {
        month: r.month,
        netRevenue: r.netRevenue,
        cost: r.cost,
        marginPct: pct.ok ? pct.value : null,
      };
    }),
    byCompany: marginRanking(companies.map(toMarginRow)),
    byCategory: marginRanking(categories.map(toMarginRow)),
    byRep: marginRanking(reps.map(toMarginRow)),
  };
}

interface MarginGroupRow {
  key: string;
  label: string;
  orderCount: bigint;
  listValue: number | null;
  companyDiscount: number | null;
  volumeDiscount: number | null;
  promotionDiscount: number | null;
  netRevenue: number | null;
  cost: number | null;
  coveredRevenue: number | null;
}

function toMarginRow(r: MarginGroupRow): MarginRowInput {
  return {
    key: r.key,
    label: r.label,
    listValue: r.listValue ?? 0,
    discountTotal:
      (r.companyDiscount ?? 0) + (r.volumeDiscount ?? 0) + (r.promotionDiscount ?? 0),
    netRevenue: r.netRevenue ?? 0,
    cost: r.cost ?? 0,
    coveredRevenue: r.coveredRevenue ?? 0,
    orderCount: Number(r.orderCount),
  };
}

// ── nakit ───────────────────────────────────────────────────────────────────

async function computeCash(now: Date): Promise<CashSnapshot> {
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const [receivable, revenue] = await Promise.all([
    receivableTotals(now),
    sumRevenue(new Date(now.getFullYear(), now.getMonth() - 11, 1), now),
  ]);

  const aging = await prisma.$queryRaw<
    Array<{ month: string; overdue: number; total: number }>
  >`
    SELECT to_char(t."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM') AS month,
           SUM(CASE WHEN COALESCE(t."dueDate", t."createdAt") < ${now} THEN t."amount" ELSE 0 END)::float8 AS overdue,
           SUM(t."amount")::float8 AS total
    FROM "Transaction" t
    WHERE t."type" = 'DEBIT' AND t."createdAt" >= ${yearAgo}
    GROUP BY 1 ORDER BY 1
  `;

  // Vadesinde ödeme: borcun vadesi ile onu kapatan tahsilatın tarihi arasında
  // kaç gün var. Kuruşuna kadar eşleme (FIFO) yerine firma bazında ortalama —
  // pano bir mutabakat belgesi değil, bir gösterge.
  const delays = await prisma.$queryRaw<
    Array<{ companyId: string; companyName: string; avgDelay: number; paid: bigint }>
  >`
    WITH debts AS (
      SELECT t."companyId" AS company_id,
             COALESCE(t."dueDate", t."createdAt") AS due,
             t."amount" AS amount
      FROM "Transaction" t WHERE t."type" = 'DEBIT' AND t."createdAt" >= ${yearAgo}
    ),
    credits AS (
      SELECT t."companyId" AS company_id, t."createdAt" AS paid_at
      FROM "Transaction" t WHERE t."type" = 'CREDIT' AND t."createdAt" >= ${yearAgo}
    )
    SELECT c."id" AS "companyId", c."name" AS "companyName",
           COALESCE(AVG(EXTRACT(EPOCH FROM (cr.paid_at - d.due)) / 86400), 0)::float8 AS "avgDelay",
           COUNT(cr.paid_at) AS paid
    FROM "Company" c
    JOIN debts d ON d.company_id = c."id"
    LEFT JOIN LATERAL (
      SELECT paid_at FROM credits
      WHERE company_id = c."id" AND paid_at >= d.due - INTERVAL '60 days'
      ORDER BY paid_at LIMIT 1
    ) cr ON true
    GROUP BY 1, 2
    HAVING COUNT(cr.paid_at) > 0
    ORDER BY 3 DESC
    LIMIT 15
  `;

  const calendar = await prisma.$queryRaw<
    Array<{ weekStart: Date; amount: number; count: bigint }>
  >`
    SELECT date_trunc('week', c."dueDate") AS "weekStart",
           SUM(c."amount")::float8 AS amount,
           COUNT(*) AS count
    FROM "Cheque" c
    WHERE c."status" IN ('PORTFOLIO', 'DEPOSITED')
      AND c."dueDate" >= ${now}
      AND c."dueDate" < ${new Date(now.getTime() + 90 * 86_400_000)}
    GROUP BY 1 ORDER BY 1
  `;

  const [bounced] = await prisma.$queryRaw<Array<{ bounced: bigint; total: bigint }>>`
    SELECT COUNT(*) FILTER (WHERE c."status" = 'BOUNCED') AS bounced, COUNT(*) AS total
    FROM "Cheque" c WHERE c."createdAt" >= ${yearAgo}
  `;

  const bouncedTotal = Number(bounced?.total ?? 0);

  return {
    dsoDays: dso(receivable.receivableTotal, revenue, 365),
    agingTrend: aging,
    overdueSharePct:
      receivable.receivableTotal > 0
        ? (receivable.overdueTotal / receivable.receivableTotal) * 100
        : null,
    averageDelayDays:
      delays.length > 0
        ? delays.reduce((a, d) => a + d.avgDelay, 0) / delays.length
        : null,
    chequeCalendar: calendar.map((c) => ({
      weekStart: c.weekStart.toISOString().slice(0, 10),
      amount: c.amount,
      count: Number(c.count),
    })),
    // On kâğıttan azında oran gürültü: bir tane karşılıksız çek "%50" diye
    // okunur ve o cümle yanlıştır.
    bouncedPct:
      bouncedTotal >= BOUNCED_MIN_SAMPLE
        ? (Number(bounced!.bounced) / bouncedTotal) * 100
        : null,
    bouncedSample: bouncedTotal,
    slowPayers: delays.map((d) => ({
      companyId: d.companyId,
      companyName: d.companyName,
      averageDelayDays: d.avgDelay,
      paidCount: Number(d.paid),
    })),
  };
}

export { insufficient, ok };
