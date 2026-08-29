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
      unit: "ay" | "sipariş" | "firma" | "kâğıt" | "yüzde";
      /** Sayının neden yokluğu; "az veri"den başka bir sebep varsa. */
      reason?: string;
    };

export function insufficient<T>(
  need: number,
  have: number,
  unit: "ay" | "sipariş" | "firma" | "kâğıt" | "yüzde",
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
// KÂRLILIK
// ─────────────────────────────────────────────
//
// Panonun ilk beş bölümü "ne kadar sattık" sorusunu farklı açılardan soruyor.
// Bu bölüm başka bir soru soruyor: **satarken ne bıraktık.** Toptan gıdada
// ciro büyürken kârın küçülmesi olağan bir kaza — iskontonun üç ayrı kaynağı
// var (firma anlaşması, hacim merdiveni, kampanya) ve üçü aynı satırda
// toplanınca kimse tek tek ne verdiğini görmüyor.

/**
 * Marjın yazılabilmesi için gereken maliyet kapsamı.
 *
 * Kataloğun tamamına alış fiyatı girilmemiş bir kurulumda "brüt marj %46,7"
 * cümlesi uydurmadır: maliyetsiz ürünlerin maliyeti sıfır sayılıyor ve marj
 * yukarı şişiyor. Kapsam altındaysa sayı yerine eksiğin kendisi gösteriliyor
 * (§6.5, "az veriyle yalan söyleme").
 */
export const MARGIN_MIN_COST_COVERAGE = 60;

/**
 * Bir satırın (firma, kategori, plasiyer) sıralamaya girebilmesi için gereken
 * sipariş sayısı.
 *
 * Tek siparişlik bir firma listenin başına da sonuna da oturabilir ve ikisi de
 * bir şey anlatmaz: o tek siparişte verilen kampanya iskontosu, firmanın
 * kârlılığı değil o günün kampanyasıdır. Eşiğin altındakiler sıralamadan
 * düşüyor ve **kaç tanesinin düştüğü yazılıyor** — sessizce elenen satır,
 * listeyi olduğundan temiz gösterir.
 */
export const MARGIN_MIN_ORDERS = 3;

export interface MarginInput {
  /** İskontosuz liste bedeli: adet × birim fiyat, KDV hariç. */
  listValue: number;
  /** Firmanın kendi anlaşmalı iskontosu (hacim merdiveni hariç). */
  companyDiscount: number;
  /** Hacim merdiveninin eklediği pay. */
  volumeDiscount: number;
  /** Kampanyaların satıra dağıtılmış payı. */
  promotionDiscount: number;
  /** Net mal bedeli, KDV ve navlun hariç. */
  netRevenue: number;
  /** Satılan malın maliyeti — alış fiyatı girilmemiş varyant sıfır sayılır. */
  cost: number;
  /** Net cironun alış fiyatı **girilmiş** üründen gelen kısmı. */
  coveredRevenue: number;
}

export interface MarginStep {
  key: "company" | "volume" | "promotion";
  label: string;
  amount: number;
  /** Liste bedelinin yüzde kaçı. */
  sharePct: number | null;
}

export interface MarginBridge {
  listValue: number;
  steps: MarginStep[];
  discountTotal: number;
  discountSharePct: number | null;
  netRevenue: number;
  cost: number;
  grossProfit: number;
  grossMarginPct: Indicator<number>;
  costCoveragePct: number | null;
}

/** Net cironun yüzde kaçının arkasında bir alış fiyatı var. */
export function costCoverage(
  coveredRevenue: number,
  netRevenue: number,
): number | null {
  if (netRevenue <= 0) return null;
  return (coveredRevenue / netRevenue) * 100;
}

/**
 * Brüt marj yüzdesi — kapsam yetmiyorsa **sayı yerine eksiğin kendisi**.
 *
 * Maliyetsiz varyant maliyeti sıfır sayılır; kapsam düştükçe marj yukarı
 * şişer. Eşiğin altında bir yüzde basmak, en kolay inanılan yalanı basmak
 * olurdu — ekranda "%78 marj" yazarken gerçeğin %31 olduğu bir kurulum,
 * fiyat kararlarını o yalanın üstüne kurar.
 */
export function marginPct(
  netRevenue: number,
  cost: number,
  coveredRevenue: number,
): Indicator<number> {
  const coverage = costCoverage(coveredRevenue, netRevenue);
  if (netRevenue <= 0) {
    return insufficient(1, 0, "sipariş", "dönemde net ciro yok");
  }
  if (coverage === null || coverage < MARGIN_MIN_COST_COVERAGE) {
    const have = Math.round(coverage ?? 0);
    return insufficient(
      MARGIN_MIN_COST_COVERAGE,
      have,
      "yüzde",
      `cironun yalnızca %${have}'inde alış fiyatı var; marj için en az %${MARGIN_MIN_COST_COVERAGE} gerekiyor`,
    );
  }
  return ok(((netRevenue - cost) / netRevenue) * 100);
}

/**
 * Liste bedelinden brüt kâra giden köprü.
 *
 * Panonun ciro köprüsünün kardeşi ve aynı işi yapıyor: toplam "net ciro
 * 4,2 milyon" diyor, bu *hangi basamakta ne kaybedildiğini* söylüyor. Üç
 * iskonto kalemi ayrı duruyor çünkü üçünün sahibi ayrı — firma iskontosu bir
 * anlaşma, hacim merdiveni bir kural, kampanya bir karar; hangisinin pahalı
 * olduğunu görmeden hiçbiri kısılamaz.
 */
export function marginBridge(input: MarginInput): MarginBridge {
  const share = (amount: number): number | null =>
    input.listValue > 0 ? (amount / input.listValue) * 100 : null;

  const steps: MarginStep[] = [
    {
      key: "company",
      label: "Firma iskontosu",
      amount: input.companyDiscount,
      sharePct: share(input.companyDiscount),
    },
    {
      key: "volume",
      label: "Hacim iskontosu",
      amount: input.volumeDiscount,
      sharePct: share(input.volumeDiscount),
    },
    {
      key: "promotion",
      label: "Kampanya",
      amount: input.promotionDiscount,
      sharePct: share(input.promotionDiscount),
    },
  ];

  const discountTotal =
    input.companyDiscount + input.volumeDiscount + input.promotionDiscount;

  return {
    listValue: input.listValue,
    steps,
    discountTotal,
    discountSharePct: share(discountTotal),
    netRevenue: input.netRevenue,
    cost: input.cost,
    grossProfit: input.netRevenue - input.cost,
    grossMarginPct: marginPct(input.netRevenue, input.cost, input.coveredRevenue),
    costCoveragePct: costCoverage(input.coveredRevenue, input.netRevenue),
  };
}

export interface MarginRowInput {
  key: string;
  label: string;
  listValue: number;
  discountTotal: number;
  netRevenue: number;
  cost: number;
  coveredRevenue: number;
  orderCount: number;
}

export interface MarginRow extends MarginRowInput {
  /** Kapsam yetersizse `null` — `marginPct` ile aynı kural. */
  marginPct: number | null;
  grossProfit: number;
  /** Liste bedelinin yüzde kaçı iskonto olarak verildi. */
  discountPct: number | null;
}

/**
 * Kırılım sıralaması — firma, kategori ya da plasiyer, hepsi aynı fonksiyon.
 *
 * Sıralama ölçütü **marj yüzdesi**, brüt kâr tutarı değil: "en kârsız
 * müşteri" sorusunun cevabı yüzdedir. Küçük ama %8 marjla çalışan bir bayi
 * fiyat görüşmesi gerektiriyor, büyük ve %31 marjlı olan gerektirmiyor.
 * Tutar da satırda duruyor, sıralama ölçütü olmadan.
 */
export function marginRanking(
  rows: readonly MarginRowInput[],
  minOrders = MARGIN_MIN_ORDERS,
): { rows: MarginRow[]; excluded: number } {
  const eligible = rows.filter((r) => r.orderCount >= minOrders && r.netRevenue > 0);
  return {
    rows: eligible
      .map((r) => {
        const coverage = costCoverage(r.coveredRevenue, r.netRevenue);
        return {
          ...r,
          grossProfit: r.netRevenue - r.cost,
          marginPct:
            coverage !== null && coverage >= MARGIN_MIN_COST_COVERAGE
              ? ((r.netRevenue - r.cost) / r.netRevenue) * 100
              : null,
          discountPct:
            r.listValue > 0 ? (r.discountTotal / r.listValue) * 100 : null,
        };
      })
      .sort((a, b) => {
        // Kapsamı olmayan satır sıralamanın sonunda: yüzdesi yok, ve `null`u
        // sıfır saymak "bu firma zarar ettiriyor" demek olurdu.
        if (a.marginPct === null && b.marginPct === null) {
          return b.netRevenue - a.netRevenue;
        }
        if (a.marginPct === null) return 1;
        if (b.marginPct === null) return -1;
        return b.marginPct - a.marginPct;
      }),
    excluded: rows.length - eligible.length,
  };
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

/**
 * Resmî tatil takvimi: `"YYYY-MM-DD" -> yarım gün mü`.
 *
 * Yarım gün (arife) 0,5 iş günü sayılıyor; tam tatil 0. Set değil map,
 * çünkü "tatil mi" sorusunun üç cevabı var, iki değil.
 */
export type HolidayMap = ReadonlyMap<string, boolean>;

/**
 * Yerel gün anahtarı — takvimde ilerleyen sayaç için.
 *
 * `toISOString` kullanılamaz: UTC+3'te yerel gece yarısı UTC'de bir önceki
 * günün 21:00'i, yani her anahtar bir gün geriye kayardı.
 */
export function dayKey(d: Date): string {
  return key(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * UTC gün anahtarı — **veritabanından gelen `DATE` kolonları için**.
 *
 * Postgres `DATE` saat taşımıyor; sürücü onu UTC gece yarısı olarak veriyor.
 * O değeri yerel getter'la okumak UTC+3'te doğru günü, UTC-5'te bir önceki
 * günü verirdi — yani takvim, sunucunun saat dilimine göre kayardı. İki ayrı
 * fonksiyon olmasının sebebi bu: biri takvimde yürüyen imleç için, diğeri
 * diskteki gün için, ve ikisi de aynı "YYYY-AA-GG" dizesini üretiyor.
 */
export function dayKeyUtc(d: Date): string {
  return key(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function key(year: number, month: number, day: number): string {
  return `${year}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
}

/**
 * İki tarih arasındaki iş günü sayısı (Pzt–Cum), **her iki uç dahil**.
 *
 * Resmî tatiller verilirse düşülüyor (KALAN-ISLER §6.4): bayram ayında ayın
 * yarısı geçmişken dokuz tatil gününü çalışılmış saymak ay sonu tahminini
 * yukarı çekiyordu. Takvim boşsa davranış eskisiyle birebir aynı — tatil
 * girilmemiş bir kurulumda hiçbir sayı değişmiyor.
 *
 * Sonuç kesir olabilir (arife = 0,5).
 */
export function businessDaysBetween(
  from: Date,
  to: Date,
  holidays?: HolidayMap,
): number {
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const half = holidays?.get(dayKey(cursor));
      // `undefined` = tatil değil, `false` = tam tatil, `true` = yarım gün.
      count += half === undefined ? 1 : half ? 0.5 : 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
