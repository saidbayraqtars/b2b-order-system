import type { RfmSegment } from "@repo/types";

// Yönetici panosunun matematiği. Veritabanına hiç bakmıyor — girdisi
// toplanmış satırlar, çıktısı sayı.
//
// **Toplama SQL'de, matematik JS'te** (Adım 18 deseni + Adım 56 kuralı).
// Regresyon, kohort matrisi ve HHI veritabanında yazılabilirdi ama orada
// okunamaz ve test edilemez hâle gelirdi; toplamlar ise JS'e taşınırsa bütün
// sipariş geçmişini belleğe indirmek gerekir. Sınır bu dosyanın kendisi:
// buraya giren şey zaten gruplanmış.
//
// Dosyanın ikinci işi **yetersiz veriyi söylemek**. Bir panonun en kolay yalan
// söylediği yer burası: üç aylık veriden çıkan bir CAGR da bir yüzde gibi
// görünür. Her göstergenin bir asgari veri şartı var ve karşılanmıyorsa sayı
// yerine eksiğin kendisi dönüyor.

/**
 * Bir gösterge: ya bir değer, ya "yeterli veri yok".
 *
 * Ekran ikisini ayırt etmek zorunda; `null` dönmek "sıfır" ile "bilinmiyor"u
 * aynı kutuya koyardı.
 */
export type Indicator<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      need: number;
      have: number;
      unit: "ay" | "sipariş" | "firma" | "kâğıt";
      /** Sayının neden yokluğu; "az veri"den başka bir sebep varsa. */
      reason?: string;
    };

export function insufficient<T>(
  need: number,
  have: number,
  unit: "ay" | "sipariş" | "firma" | "kâğıt",
  reason?: string,
): Indicator<T> {
  return { ok: false, need, have, unit, ...(reason ? { reason } : {}) };
}

export function ok<T>(value: T): Indicator<T> {
  return { ok: true, value };
}

// ─────────────────────────────────────────────
// SERİ
// ─────────────────────────────────────────────

export interface MonthPoint {
  /** `YYYY-MM`. */
  month: string;
  value: number;
}

/**
 * Hareketli ortalama — gürültüyü seriden ayırmak için.
 *
 * Pencere dolmadan değer üretilmiyor (`null`): ilk ayın "3 aylık ortalaması"
 * o ayın kendisidir ve bunu ortalama diye çizmek trendi ayın gürültüsüyle
 * başlatır.
 */
export function movingAverage(
  points: readonly MonthPoint[],
  window = 3,
): Array<{ month: string; value: number | null }> {
  return points.map((p, i) => {
    if (i + 1 < window) return { month: p.month, value: null };
    const slice = points.slice(i + 1 - window, i + 1);
    const sum = slice.reduce((a, x) => a + x.value, 0);
    return { month: p.month, value: sum / window };
  });
}

/** Yıl-üstü-yıl: her ay, on iki ay öncesiyle. */
export function yearOverYear(
  points: readonly MonthPoint[],
): Array<{ month: string; value: number; previous: number | null; changePct: number | null }> {
  const byMonth = new Map(points.map((p) => [p.month, p.value]));
  return points.map((p) => {
    const previous = byMonth.get(shiftMonth(p.month, -12)) ?? null;
    return {
      month: p.month,
      value: p.value,
      previous,
      changePct:
        previous === null || previous === 0
          ? null
          : ((p.value - previous) / previous) * 100,
    };
  });
}

/** `2026-08` + n ay. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}`;
}

/**
 * En küçük kareler eğimi: "aylık ortalama +X TL".
 *
 * Altı aydan az veriyle bir doğru uydurmak, üç noktadan geçen bir çizgiye
 * "trend" demektir.
 */
export const TREND_MIN_MONTHS = 6;

export function trendSlope(points: readonly MonthPoint[]): Indicator<number> {
  if (points.length < TREND_MIN_MONTHS) {
    return insufficient(TREND_MIN_MONTHS, points.length, "ay");
  }
  const n = points.length;
  const meanX = (n - 1) / 2;
  const meanY = points.reduce((a, p) => a + p.value, 0) / n;
  let num = 0;
  let den = 0;
  points.forEach((p, i) => {
    num += (i - meanX) * (p.value - meanY);
    den += (i - meanX) ** 2;
  });
  return ok(den === 0 ? 0 : num / den);
}

/**
 * Bileşik yıllık büyüme. **En az 24 ay** — iki tam yıl olmadan "yıllık büyüme"
 * diye bir şey yok, mevsimsellik tek başına yüzdeyi istediği yere taşır.
 */
export const CAGR_MIN_MONTHS = 24;

export function cagr(points: readonly MonthPoint[]): Indicator<number> {
  if (points.length < CAGR_MIN_MONTHS) {
    return insufficient(CAGR_MIN_MONTHS, points.length, "ay");
  }
  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  // Taban sıfırsa oran tanımsız — ve bu "az veri" değil başka bir sebep:
  // serinin ilk ayında hiç satış yok. İkisini aynı cümleyle söylemek,
  // ekranda "en az 24 ay gerekiyor" yazıp 24 ayı olan kullanıcıyı şaşırtır.
  if (first <= 0) {
    return insufficient(
      CAGR_MIN_MONTHS,
      points.length,
      "ay",
      "serinin ilk ayında ciro yok — oranın tabanı sıfır",
    );
  }
  const years = (points.length - 1) / 12;
  return ok((Math.pow(last / first, 1 / years) - 1) * 100);
}

// ─────────────────────────────────────────────
// CİRO KÖPRÜSÜ
// ─────────────────────────────────────────────

export interface BridgeInput {
  companyId: string;
  previous: number;
  current: number;
}

/**
 * Geçen dönem → bu dönem farkının dört parçası.
 *
 * **Panonun en öğretici tek grafiği.** Toplam ciro çizgisi "büyüdük" diyor;
 * bu, *neden* büyüdüğünü söylüyor — yeni müşteriden mi geldi, yoksa
 * mevcutlar mı daha çok aldı, ve arka planda kaç müşteri kaybedildi.
 */
export function revenueBridge(rows: readonly BridgeInput[]): {
  previousTotal: number;
  currentTotal: number;
  newCustomers: number;
  lostCustomers: number;
  expansion: number;
  contraction: number;
  counts: { new: number; lost: number; grown: number; shrunk: number };
} {
  let newCustomers = 0;
  let lostCustomers = 0;
  let expansion = 0;
  let contraction = 0;
  const counts = { new: 0, lost: 0, grown: 0, shrunk: 0 };

  for (const r of rows) {
    if (r.previous === 0 && r.current > 0) {
      newCustomers += r.current;
      counts.new += 1;
    } else if (r.previous > 0 && r.current === 0) {
      lostCustomers += r.previous;
      counts.lost += 1;
    } else if (r.current > r.previous) {
      expansion += r.current - r.previous;
      counts.grown += 1;
    } else if (r.current < r.previous) {
      contraction += r.previous - r.current;
      counts.shrunk += 1;
    }
  }

  return {
    previousTotal: rows.reduce((a, r) => a + r.previous, 0),
    currentTotal: rows.reduce((a, r) => a + r.current, 0),
    newCustomers,
    lostCustomers: -lostCustomers,
    expansion,
    contraction: -contraction,
    counts,
  };
}

// ─────────────────────────────────────────────
// MÜŞTERİ
// ─────────────────────────────────────────────

export interface RfmInput {
  companyId: string;
  companyName: string;
  /** Son siparişin üstünden geçen gün. */
  recencyDays: number;
  /** Dönemdeki sipariş adedi. */
  frequency: number;
  /** Dönemdeki ciro. */
  monetary: number;
}

export type { RfmSegment };

export interface RfmRow extends RfmInput {
  r: number;
  f: number;
  m: number;
  segment: RfmSegment;
}

/**
 * RFM: çeyrekliklere bölüp segmente oturtuyor.
 *
 * Sabit eşik (ör. "90 günden eskiyse riskli") yok: eşik sektöre ve müşteri
 * kitlesine göre değişir, çeyreklik ise her kurulumun kendi dağılımından
 * çıkıyor. Bunun bedeli, dağılımın dar olduğu küçük kurulumlarda segmentlerin
 * anlamsızlaşması — bu yüzden asgari firma şartı var.
 */
export const RFM_MIN_COMPANIES = 8;

export function rfm(rows: readonly RfmInput[]): Indicator<RfmRow[]> {
  if (rows.length < RFM_MIN_COMPANIES) {
    return insufficient(RFM_MIN_COMPANIES, rows.length, "firma");
  }

  // Recency'de küçük iyidir, o yüzden ters puanlanıyor.
  const rScore = quartileScorer(rows.map((r) => r.recencyDays), true);
  const fScore = quartileScorer(rows.map((r) => r.frequency), false);
  const mScore = quartileScorer(rows.map((r) => r.monetary), false);

  return ok(
    rows.map((row) => {
      const r = rScore(row.recencyDays);
      const f = fScore(row.frequency);
      const m = mScore(row.monetary);
      return { ...row, r, f, m, segment: segmentOf(r, f, m) };
    }),
  );
}

function segmentOf(r: number, f: number, m: number): RfmSegment {
  const value = (f + m) / 2;
  if (r >= 3 && value >= 3) return "sampiyon";
  if (r >= 3) return "sadik";
  if (r === 2 && value >= 3) return "riskli";
  if (r === 2) return "uykuda";
  return value >= 3 ? "riskli" : "kayip";
}

/** 1–4 arası çeyreklik puanı; `invert` küçük değeri iyi sayar. */
function quartileScorer(
  values: readonly number[],
  invert: boolean,
): (v: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  const cut = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
  const q1 = cut(0.25);
  const q2 = cut(0.5);
  const q3 = cut(0.75);
  return (v: number) => {
    const raw = v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4;
    return invert ? 5 - raw : raw;
  };
}

/**
 * Konsantrasyon: Pareto eğrisi + HHI.
 *
 * HHI (Herfindahl-Hirschman) payların karelerinin toplamı; 0'a yakın dağınık,
 * 10.000 tek müşteri demek. Tek başına soyut, o yüzden yanında "cironun
 * %80'i kaç firmadan" duruyor — asıl okunacak sayı o.
 */
export function concentration(revenues: readonly number[]): {
  hhi: number;
  top1Pct: number;
  top5Pct: number;
  companiesFor80Pct: number;
  total: number;
} {
  const total = revenues.reduce((a, v) => a + v, 0);
  if (total <= 0) {
    return { hhi: 0, top1Pct: 0, top5Pct: 0, companiesFor80Pct: 0, total: 0 };
  }
  const sorted = [...revenues].sort((a, b) => b - a);
  const share = (v: number) => (v / total) * 100;

  let cumulative = 0;
  let companiesFor80Pct = 0;
  for (const v of sorted) {
    cumulative += v;
    companiesFor80Pct += 1;
    if (cumulative / total >= 0.8) break;
  }

  return {
    hhi: sorted.reduce((a, v) => a + share(v) ** 2, 0),
    top1Pct: share(sorted[0] ?? 0),
    top5Pct: sorted.slice(0, 5).reduce((a, v) => a + share(v), 0),
    companiesFor80Pct,
    total,
  };
}

/**
 * Sessizleşen müşteri.
 *
 * Eşik **sabit 90 gün değil**: firmanın kendi normal sipariş periyodunun iki
 * katı. Haftada bir alan bayi için 30 gün zaten alarmdır, mevsimlik alan için
 * değildir — sabit eşik ikisini de yanlış bildirir.
 *
 * Periyodu olmayan (tek siparişlik) firma hesaba girmiyor: bir siparişten
 * periyot çıkmaz.
 */
export const QUIET_MIN_ORDERS = 3;

export interface QuietInput {
  companyId: string;
  companyName: string;
  orderCount: number;
  /** Siparişler arası ortanca gün. */
  medianIntervalDays: number | null;
  daysSinceLastOrder: number;
  lastOrderAt: string | null;
}

export function quietCustomers(rows: readonly QuietInput[]): Array<
  QuietInput & { expectedEveryDays: number; overdueDays: number }
> {
  return rows
    .filter(
      (r) =>
        r.orderCount >= QUIET_MIN_ORDERS &&
        r.medianIntervalDays !== null &&
        r.medianIntervalDays > 0 &&
        r.daysSinceLastOrder > r.medianIntervalDays * 2,
    )
    .map((r) => ({
      ...r,
      expectedEveryDays: Math.round(r.medianIntervalDays!),
      overdueDays: Math.round(r.daysSinceLastOrder - r.medianIntervalDays! * 2),
    }))
    .sort((a, b) => b.overdueDays - a.overdueDays);
}

/** Ortanca — ortalamadan farkı: tek bir uzun tatil periyodu bozmuyor. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// ─────────────────────────────────────────────
// ÜRÜN
// ─────────────────────────────────────────────

export type AbcClass = "A" | "B" | "C";

/** Ciro Pareto'su: %80'e kadar A, %95'e kadar B, gerisi C. */
export function abcClasses<T extends { revenue: number }>(
  rows: readonly T[],
): Array<T & { abc: AbcClass; cumulativePct: number }> {
  const total = rows.reduce((a, r) => a + r.revenue, 0);
  if (total <= 0) {
    return rows.map((r) => ({ ...r, abc: "C" as const, cumulativePct: 0 }));
  }
  let cumulative = 0;
  return [...rows]
    .sort((a, b) => b.revenue - a.revenue)
    .map((r) => {
      cumulative += r.revenue;
      const pct = (cumulative / total) * 100;
      return { ...r, abc: pct <= 80 ? "A" : pct <= 95 ? "B" : "C", cumulativePct: pct };
    });
}

/**
 * Stok devir hızı ve DIO.
 *
 * Devir = satılan malın maliyeti / ortalama stok değeri. DIO = 365 / devir,
 * yani "eldeki mal kaç günde tükeniyor". Ortalama stok sıfırsa devir tanımsız
 * — sıfıra bölmek yerine gösterge yok sayılıyor.
 */
export function inventoryTurnover(
  cogs: number,
  averageStockValue: number,
): { turnover: number; dioDays: number } | null {
  if (averageStockValue <= 0 || cogs <= 0) return null;
  const turnover = cogs / averageStockValue;
  return { turnover, dioDays: 365 / turnover };
}

// ─────────────────────────────────────────────
// NAKİT
// ─────────────────────────────────────────────

/**
 * DSO — alacağın tahsile dönmesi kaç gün sürüyor.
 *
 * (ortalama alacak / dönem cirosu) × gün. Ciro sıfırken tanımsız.
 */
export function dso(
  averageReceivable: number,
  periodRevenue: number,
  days: number,
): number | null {
  if (periodRevenue <= 0) return null;
  return (averageReceivable / periodRevenue) * days;
}

// ─────────────────────────────────────────────
// GİDİŞAT
// ─────────────────────────────────────────────

/**
 * Ay sonu projeksiyonu.
 *
 * **İş gününe göre**, takvim gününe göre değil: ayın 15'i bir pazara denk
 * geldiğinde "ayın yarısı geçti" demek toptancıda yanlış, çünkü satış hafta
 * içi oluyor. Mevsimsel indeks verilirse (geçen yılın aynı ayının aynı
 * noktasındaki oranı) düzeltme olarak uygulanıyor.
 */
export function monthEndProjection(input: {
  achieved: number;
  businessDaysElapsed: number;
  businessDaysInMonth: number;
  /** Geçen yılın aynı ayında bu noktada cironun ne kadarı yapılmıştı (0–1). */
  seasonalIndex?: number | null;
}): number | null {
  const { achieved, businessDaysElapsed, businessDaysInMonth } = input;
  if (businessDaysElapsed <= 0 || businessDaysInMonth <= 0) return null;

  const linear = (achieved / businessDaysElapsed) * businessDaysInMonth;
  const index = input.seasonalIndex;
  if (index && index > 0.05 && index <= 1) return achieved / index;
  return linear;
}

/**
 * Serinin başındaki boş ayları at.
 *
 * Kurulum iki ay önce açıldıysa öncesindeki yirmi iki ay sıfır olarak
 * dolduruluyor ve o sıfırlar eğimi de, hareketli ortalamayı da aşağı çekiyor:
 * "aylık ortalama +45.826 TL büyüme" cümlesi, işin var olmadığı aylardan
 * geliyordu. İşin başlamadığı ay bir veri noktası değil.
 */
export function trimLeadingEmpty(points: readonly MonthPoint[]): MonthPoint[] {
  const first = points.findIndex((p) => p.value > 0);
  return first <= 0 ? [...points] : points.slice(first);
}

/** Ay içindeki iş günü sayısı (Pzt–Cum). Resmî tatil bilgisi yok, notu ekranda. */
export function businessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
