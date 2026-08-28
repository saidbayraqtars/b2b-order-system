import { prisma } from "@repo/database";
import type { CommissionBase, TargetPeriod } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, type Money } from "./money";
import { REVENUE_STATUSES } from "./reports";

// Plasiyer primi ve hakediş.
//
// Hedefler Adım 34'te gelmişti; prim yoktu. Sektörde plasiyer primle çalışır ve
// prim **iki tabandan** hesaplanır: ciro ve tahsilat — satıp tahsil edemeyen
// plasiyer kâr getirmez.
//
// Kural motoru yok, bilerek: prim şu dörtten ibaret — taban, oran, dönem ve
// hedef çarpanı. Kampanya motorundaki gibi bir kayıt defteri kurmak, dört
// alanın üstüne bir yorumlayıcı koymak olurdu.
//
// **Atıf portföye göre**, kaydı kimin girdiğine göre değil. Prim hesaba bağlı:
// ofisten girilen bir tahsilat da o carinin plasiyerinin primini doğurur, ve
// başka bir plasiyerin cariden tahsil etmesi primi ona geçirmez.

export interface CommissionPlanRow {
  id: string;
  name: string;
  base: CommissionBase;
  rate: string;
  period: TargetPeriod;
  targetMultiplier: string;
  minBase: string;
  isActive: boolean;
  repIds: string[];
  repNames: string[];
}

export async function listCommissionPlans(): Promise<CommissionPlanRow[]> {
  const rows = await prisma.commissionPlan.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      base: true,
      rate: true,
      period: true,
      targetMultiplier: true,
      minBase: true,
      isActive: true,
      reps: { select: { id: true, name: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    base: p.base,
    rate: p.rate.toFixed(2),
    period: p.period,
    targetMultiplier: p.targetMultiplier.toFixed(2),
    minBase: p.minBase.toFixed(2),
    isActive: p.isActive,
    repIds: p.reps.map((r) => r.id),
    repNames: p.reps.map((r) => r.name),
  }));
}

export interface SaveCommissionPlanInput {
  id?: string;
  name: string;
  base: CommissionBase;
  rate: number;
  period: TargetPeriod;
  targetMultiplier?: number;
  minBase?: number;
  isActive?: boolean;
  repIds: string[];
}

export async function saveCommissionPlan(
  input: SaveCommissionPlanInput,
): Promise<{ id: string }> {
  if (input.rate <= 0 || input.rate > 100) {
    throw new BusinessError("INVALID_COMMISSION", "Oran 0 ile 100 arasında olmalı.");
  }
  if ((input.targetMultiplier ?? 1) < 1) {
    throw new BusinessError(
      "INVALID_COMMISSION",
      "Hedef çarpanı 1'den küçük olamaz — hedefi tutturmak primi düşürmemeli.",
    );
  }

  // Yalnızca plasiyer atanabiliyor: prim bir saha ödemesi ve bir bayi
  // kullanıcısına prim planı bağlamak sessiz bir hata olurdu.
  if (input.repIds.length > 0) {
    const reps = await prisma.user.findMany({
      where: { id: { in: input.repIds }, role: "SALES_REP" },
      select: { id: true },
    });
    if (reps.length !== input.repIds.length) {
      throw new BusinessError(
        "INVALID_COMMISSION",
        "Prim planı yalnızca satış temsilcilerine atanabilir.",
      );
    }
  }

  const fields = {
    name: input.name.trim(),
    base: input.base,
    rate: input.rate,
    period: input.period,
    targetMultiplier: input.targetMultiplier ?? 1,
    minBase: input.minBase ?? 0,
    isActive: input.isActive ?? true,
  };
  const reps = input.repIds.map((id) => ({ id }));

  // `set` yalnızca güncellemede geçerli; yaratmada `connect`. Tek bir nesneyi
  // ikisine birden vermek Prisma'nın kabul etmediği bir şey ve haklı: yeni bir
  // satırda "kümeyi şuna eşitle" diye bir şey yok.
  const row = input.id
    ? await prisma.commissionPlan.update({
        where: { id: input.id },
        data: { ...fields, reps: { set: reps } },
        select: { id: true },
      })
    : await prisma.commissionPlan.create({
        data: { ...fields, reps: { connect: reps } },
        select: { id: true },
      });
  return row;
}

export async function deleteCommissionPlan(id: string): Promise<void> {
  await prisma.commissionPlan.delete({ where: { id } });
}

// ─────────────────────────────────────────────
// HAKEDİŞ
// ─────────────────────────────────────────────

/** Dönemin yerel sınırları — hedeflerle ve ekstreyle aynı çerçeve. */
export function periodBounds(
  period: TargetPeriod,
  anchor: Date,
): { start: Date; end: Date } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();

  switch (period) {
    case "DAILY":
      return {
        start: new Date(y, m, d, 0, 0, 0, 0),
        end: new Date(y, m, d, 23, 59, 59, 999),
      };
    case "WEEKLY": {
      // Hafta pazartesi başlıyor: Türkiye'de iş haftası öyle ve hedef ekranı
      // da böyle sayıyor.
      const dow = (anchor.getDay() + 6) % 7;
      const start = new Date(y, m, d - dow, 0, 0, 0, 0);
      const end = new Date(y, m, d - dow + 6, 23, 59, 59, 999);
      return { start, end };
    }
    case "YEARLY":
      return {
        start: new Date(y, 0, 1, 0, 0, 0, 0),
        end: new Date(y, 11, 31, 23, 59, 59, 999),
      };
    case "MONTHLY":
    default:
      return {
        start: new Date(y, m, 1, 0, 0, 0, 0),
        end: new Date(y, m + 1, 0, 23, 59, 59, 999),
      };
  }
}

export interface AccrualRow {
  planId: string;
  planName: string;
  base: CommissionBase;
  rate: string;
  repId: string;
  repName: string;
  /** Dönemdeki taban tutar (ciro ya da tahsilat). */
  baseAmount: string;
  /** Bu dönem için tanımlı ciro hedefi; yoksa null. */
  target: string | null;
  /** Hedef tutturuldu mu — çarpan buna bağlı. */
  targetMet: boolean;
  /** Uygulanan oran; hedef tutturulduysa `rate × targetMultiplier`. */
  effectiveRate: string;
  /** Hak edilen prim. */
  amount: string;
  /** Eşiğin altında kaldıysa sebebi ekranda yazsın diye. */
  belowMinimum: boolean;
}

export interface CommissionAccrual {
  periodStart: string;
  periodEnd: string;
  rows: AccrualRow[];
  total: string;
}

/**
 * Bir dönemin hakedişi.
 *
 * Ciro **net mal bedeli** (KDV ve navlun hariç) ve yalnızca gerçekleşmiş
 * siparişler (`REVENUE_STATUSES`) — hacim iskontosunun ciro tanımıyla aynı.
 * İki farklı "ciro" tanımı, iki ekranda iki farklı sayı demek olurdu.
 *
 * Tahsilat, defterin `CREDIT` satırları. **Ters kayıtlar kendiliğinden
 * düşüyor**: bir tahsilatın iptali `DEBIT` değil, ters bir `CREDIT` değil —
 * ekstre onu ayrı bir satırla geri yazıyor ve toplam zaten küçülüyor
 * (bkz. `reversalOfId`).
 */
export async function getCommissionAccrual(
  anchor: Date = new Date(),
  opts: { repId?: string } = {},
): Promise<CommissionAccrual> {
  const plans = await prisma.commissionPlan.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      base: true,
      rate: true,
      period: true,
      targetMultiplier: true,
      minBase: true,
      reps: {
        where: opts.repId ? { id: opts.repId } : undefined,
        select: { id: true, name: true },
      },
    },
  });

  // Dönem sınırı plan başına: aylık ve haftalık planlar aynı ekranda olabilir.
  const rows: AccrualRow[] = [];
  let widestStart: Date | null = null;
  let widestEnd: Date | null = null;

  for (const plan of plans) {
    if (plan.reps.length === 0) continue;
    const { start, end } = periodBounds(plan.period, anchor);
    if (!widestStart || start < widestStart) widestStart = start;
    if (!widestEnd || end > widestEnd) widestEnd = end;

    const repIds = plan.reps.map((r) => r.id);
    // Ciro her hâlükârda hesaplanıyor: taban tahsilat olsa da **hedef** bir
    // ciro hedefi ve çarpan ona bakıyor. Tahsilatı ciro hedefiyle
    // karşılaştırmak elma ile armut olurdu — tahsilat her zaman cirodan küçük
    // ve çarpan hiç uygulanmazdı.
    const revenue = await revenueByRep(repIds, start, end);
    const amounts =
      plan.base === "REVENUE"
        ? revenue
        : await collectionByRep(repIds, start, end);

    // Hedefler tek sorguda: plan başına plasiyer sayısı kadar sorgu, on
    // plasiyette on gidiş-dönüş olurdu.
    const targets = await prisma.salesTarget.findMany({
      where: {
        salesRepId: { in: repIds },
        metric: "REVENUE",
        period: plan.period,
        periodStart: start,
      },
      select: { salesRepId: true, targetValue: true },
    });
    const targetByRep = new Map(
      targets.map((t) => [t.salesRepId, t.targetValue]),
    );

    for (const rep of plan.reps) {
      const baseAmount = amounts.get(rep.id) ?? new Dec(0);
      const target = targetByRep.get(rep.id) ?? null;
      // Çarpanın koşulu **satış hedefi**: plasiyer dönemin cirosunu tutturdu
      // mu. Taban tahsilat olsa bile karşılaştırma ciroyla yapılıyor; ayrı bir
      // tahsilat hedefi istenirse `TargetMetric` genişletilir — bugün olmayan
      // bir şeye yer açmak yerine.
      const repRevenue = revenue.get(rep.id) ?? new Dec(0);
      const targetMet =
        target !== null &&
        !new Dec(target).isZero() &&
        repRevenue.gte(new Dec(target));

      const belowMinimum = baseAmount.lt(plan.minBase);
      const effectiveRate = targetMet
        ? new Dec(plan.rate).mul(plan.targetMultiplier)
        : new Dec(plan.rate);
      const amount = belowMinimum
        ? new Dec(0)
        : baseAmount.mul(effectiveRate).div(100);

      rows.push({
        planId: plan.id,
        planName: plan.name,
        base: plan.base,
        rate: plan.rate.toFixed(2),
        repId: rep.id,
        repName: rep.name,
        baseAmount: baseAmount.toFixed(2),
        target: target?.toFixed(2) ?? null,
        targetMet,
        effectiveRate: effectiveRate.toFixed(2),
        amount: amount.toFixed(2),
        belowMinimum,
      });
    }
  }

  rows.sort(
    (a, b) => a.repName.localeCompare(b.repName, "tr") || Number(b.amount) - Number(a.amount),
  );

  const { start, end } = periodBounds("MONTHLY", anchor);
  return {
    periodStart: (widestStart ?? start).toISOString(),
    periodEnd: (widestEnd ?? end).toISOString(),
    rows,
    total: rows.reduce((sum, r) => sum.add(r.amount), new Dec(0)).toFixed(2),
  };
}

/** Portföy cirosu — net mal bedeli, gerçekleşmiş siparişler. */
async function revenueByRep(
  repIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, Money>> {
  const orders = await prisma.order.groupBy({
    by: ["companyId"],
    where: {
      createdAt: { gte: start, lte: end },
      status: { in: [...REVENUE_STATUSES] },
      company: { salesRepId: { in: repIds } },
    },
    _sum: { subtotal: true, discountTotal: true, promotionTotal: true },
  });

  const companies = await prisma.company.findMany({
    where: { id: { in: orders.map((o) => o.companyId) } },
    select: { id: true, salesRepId: true },
  });
  const repByCompany = new Map(companies.map((c) => [c.id, c.salesRepId]));

  const out = new Map<string, Money>();
  for (const o of orders) {
    const repId = repByCompany.get(o.companyId);
    if (!repId) continue;
    const net = new Dec(o._sum.subtotal ?? 0)
      .sub(o._sum.discountTotal ?? 0)
      .sub(o._sum.promotionTotal ?? 0);
    out.set(repId, (out.get(repId) ?? new Dec(0)).add(net));
  }
  return out;
}

/** Portföyden tahsil edilen para — defterin CREDIT satırları. */
async function collectionByRep(
  repIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, Money>> {
  const rows = await prisma.transaction.groupBy({
    by: ["companyId"],
    where: {
      type: "CREDIT",
      createdAt: { gte: start, lte: end },
      company: { salesRepId: { in: repIds } },
    },
    _sum: { amount: true },
  });

  const companies = await prisma.company.findMany({
    where: { id: { in: rows.map((r) => r.companyId) } },
    select: { id: true, salesRepId: true },
  });
  const repByCompany = new Map(companies.map((c) => [c.id, c.salesRepId]));

  const out = new Map<string, Money>();
  for (const r of rows) {
    const repId = repByCompany.get(r.companyId);
    if (!repId) continue;
    out.set(
      repId,
      (out.get(repId) ?? new Dec(0)).add(new Dec(r._sum.amount ?? 0)),
    );
  }
  return out;
}
