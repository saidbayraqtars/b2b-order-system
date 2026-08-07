import { Prisma, prisma } from "@repo/database";
import type { TargetMetric, TargetPeriod } from "@repo/types";
import { BusinessError } from "./errors";

// Saha hedefleri: bir plasiyerin bir dönemde kaç ziyaret yapması ve ne kadar
// ciro getirmesi beklendiği.
//
// Gerçekleşen değer hiçbir yerde saklanmıyor; her okunuşta hareketlerden
// hesaplanıyor. Saklansaydı iptal edilen bir sipariş ya da silinen bir ziyaret
// hedefi olduğundan iyi göstermeye devam ederdi — ve bunu fark etmek için
// kimsenin bakacağı bir yer olmazdı.

const Dec = Prisma.Decimal;

/**
 * Dönemin ilk gününü verir.
 *
 * Normalleştirme burada, tek yerde: aynı ay 1 Ağustos ve 3 Ağustos olarak iki
 * kez tanımlanabilseydi `@@unique` hiçbir şey korumaz, panelde iki farklı
 * hedef yan yana görünürdü. Hafta pazartesi başlar (TR iş takvimi).
 */
export function normalizePeriodStart(period: TargetPeriod, date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  switch (period) {
    case "DAILY":
      return d;
    case "WEEKLY": {
      // getDay(): 0 = pazar. Pazartesiye kaç gün geri gidileceği.
      const back = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - back);
      return d;
    }
    case "MONTHLY":
      d.setDate(1);
      return d;
    case "YEARLY":
      d.setMonth(0, 1);
      return d;
  }
}

/** Dönemin bitişi (hariç): [start, end) aralığı. */
export function periodEnd(period: TargetPeriod, start: Date): Date {
  const d = new Date(start);
  switch (period) {
    case "DAILY":
      d.setDate(d.getDate() + 1);
      return d;
    case "WEEKLY":
      d.setDate(d.getDate() + 7);
      return d;
    case "MONTHLY":
      d.setMonth(d.getMonth() + 1);
      return d;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + 1);
      return d;
  }
}

export interface SalesTargetInput {
  salesRepId: string;
  metric: TargetMetric;
  period: TargetPeriod;
  /** Dönem içindeki herhangi bir gün; başlangıca normalleştirilir. */
  periodStart: Date;
  targetValue: string | number;
  note?: string | null;
}

export interface SalesTargetRow {
  id: string;
  salesRepId: string;
  salesRepName: string;
  metric: TargetMetric;
  period: TargetPeriod;
  periodStart: string;
  periodEnd: string;
  targetValue: string;
  note: string | null;
  createdByName: string;
  updatedAt: string;
}

const SELECT = {
  id: true,
  salesRepId: true,
  salesRep: { select: { name: true } },
  metric: true,
  period: true,
  periodStart: true,
  targetValue: true,
  note: true,
  createdBy: { select: { name: true } },
  updatedAt: true,
} satisfies Prisma.SalesTargetSelect;

type Row = Prisma.SalesTargetGetPayload<{ select: typeof SELECT }>;

function toRow(r: Row): SalesTargetRow {
  return {
    id: r.id,
    salesRepId: r.salesRepId,
    salesRepName: r.salesRep.name,
    metric: r.metric,
    period: r.period,
    periodStart: r.periodStart.toISOString(),
    periodEnd: periodEnd(r.period, r.periodStart).toISOString(),
    targetValue: r.targetValue.toFixed(2),
    note: r.note,
    createdByName: r.createdBy.name,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * Hedefi yaz ya da güncelle.
 *
 * Aynı temsilci + ölçü + periyot + dönem için ikinci bir satır açılmaz;
 * yeniden gönderilen değer eskisinin üstüne yazılır. "Hedefi düzelttim ama
 * eski hedef de duruyor" durumu böylece mümkün değil.
 */
export async function upsertSalesTarget(
  input: SalesTargetInput,
  createdById: string,
): Promise<SalesTargetRow> {
  const value = new Dec(input.targetValue);
  if (value.lessThan(0)) {
    throw new BusinessError("INVALID_TARGET", "Hedef negatif olamaz");
  }
  if (input.metric === "VISITS" && !value.equals(value.trunc())) {
    throw new BusinessError("INVALID_TARGET", "Ziyaret hedefi tam sayı olmalı");
  }

  const rep = await prisma.user.findUnique({
    where: { id: input.salesRepId },
    select: { role: true },
  });
  if (!rep) throw new BusinessError("USER_NOT_FOUND", "Kullanıcı bulunamadı");
  if (rep.role !== "SALES_REP") {
    throw new BusinessError(
      "INVALID_TARGET",
      "Hedef yalnızca satış temsilcisine konur",
    );
  }

  const start = normalizePeriodStart(input.period, input.periodStart);

  const row = await prisma.salesTarget.upsert({
    where: {
      salesRepId_metric_period_periodStart: {
        salesRepId: input.salesRepId,
        metric: input.metric,
        period: input.period,
        periodStart: start,
      },
    },
    create: {
      salesRepId: input.salesRepId,
      metric: input.metric,
      period: input.period,
      periodStart: start,
      targetValue: value,
      note: input.note ?? null,
      createdById,
    },
    update: {
      targetValue: value,
      note: input.note ?? null,
      createdById,
    },
    select: SELECT,
  });

  return toRow(row);
}

export async function deleteSalesTarget(id: string): Promise<void> {
  const existing = await prisma.salesTarget.findUnique({ where: { id } });
  if (!existing) throw new BusinessError("TARGET_NOT_FOUND", "Hedef bulunamadı");
  await prisma.salesTarget.delete({ where: { id } });
}

export async function listSalesTargets(filter: {
  salesRepId?: string;
  /** Bu tarihi kapsayan dönemler. Verilmezse hepsi. */
  activeOn?: Date;
}): Promise<SalesTargetRow[]> {
  const rows = await prisma.salesTarget.findMany({
    where: filter.salesRepId ? { salesRepId: filter.salesRepId } : {},
    orderBy: [{ periodStart: "desc" }, { period: "asc" }],
    select: SELECT,
  });

  const list = rows.map(toRow);
  if (!filter.activeOn) return list;

  const at = filter.activeOn.getTime();
  return list.filter(
    (t) =>
      new Date(t.periodStart).getTime() <= at &&
      at < new Date(t.periodEnd).getTime(),
  );
}

export interface TargetProgress extends SalesTargetRow {
  /** Dönem içinde gerçekleşen. Ziyarette adet, ciroda tutar. */
  achieved: string;
  /** 0-∞. Hedef 0 ise 100 kabul edilir (koyulmamış hedef aşılamaz). */
  percent: number;
  /** Dönemin ne kadarı geçti (0-1). "Hedefin gerisinde mi" bunun yanında okunur. */
  elapsed: number;
}

/**
 * Bir temsilcinin belirli bir andaki hedef karnesi.
 *
 * `elapsed` bilerek ayrı bir sayı: ayın 3'ünde %10'da olmak iyi, 28'inde
 * felakettir. Yüzdeyi tek başına göstermek bu farkı gizler.
 */
export async function getTargetProgress(
  salesRepId: string,
  asOf: Date = new Date(),
): Promise<TargetProgress[]> {
  const targets = await listSalesTargets({ salesRepId, activeOn: asOf });

  return Promise.all(
    targets.map(async (t) => {
      const from = new Date(t.periodStart);
      const to = new Date(t.periodEnd);
      const achieved =
        t.metric === "VISITS"
          ? new Dec(await countVisits(salesRepId, from, to))
          : await sumRevenue(salesRepId, from, to);

      const target = new Dec(t.targetValue);
      const percent = target.greaterThan(0)
        ? Math.round(achieved.div(target).times(100).toNumber())
        : 100;

      const span = to.getTime() - from.getTime();
      const gone = Math.min(Math.max(asOf.getTime() - from.getTime(), 0), span);

      return {
        ...t,
        achieved: achieved.toFixed(2),
        percent,
        elapsed: span > 0 ? gone / span : 1,
      };
    }),
  );
}

/**
 * "Ziyaret noktası" = kapanmış ziyaret.
 *
 * Açık bir check-in henüz ziyaret değil: plasiyer kapıda giriş yapıp
 * çıkmadıysa ortada tamamlanmış bir iş yok. Aksi hâlde hedef, sabah arka arkaya
 * açılan check-in'lerle doldurulabilirdi.
 */
async function countVisits(
  salesRepId: string,
  from: Date,
  to: Date,
): Promise<number> {
  return prisma.checkIn.count({
    where: {
      salesRepId,
      checkOutAt: { not: null },
      checkInAt: { gte: from, lt: to },
    },
  });
}

/**
 * Ciro = temsilcinin girdiği, iptal/ret dışındaki siparişlerin genel toplamı.
 *
 * Tahsilat değil sipariş sayılıyor: hedef satış performansını ölçüyor, tahsilat
 * ayrı bir iş (ve ayrı bir hedef olabilir).
 */
async function sumRevenue(
  salesRepId: string,
  from: Date,
  to: Date,
): Promise<Prisma.Decimal> {
  const agg = await prisma.order.aggregate({
    _sum: { grandTotal: true },
    where: {
      createdById: salesRepId,
      status: { notIn: ["CANCELLED", "REJECTED", "DRAFT"] },
      createdAt: { gte: from, lt: to },
    },
  });
  return agg._sum.grandTotal ?? new Dec(0);
}
