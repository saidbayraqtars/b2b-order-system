import { describe, expect, it } from "vitest";
import {
  abcClasses,
  businessDaysBetween,
  cagr,
  concentration,
  dayKey,
  dayKeyUtc,
  dso,
  inventoryTurnover,
  median,
  monthEndProjection,
  movingAverage,
  quietCustomers,
  revenueBridge,
  rfm,
  shiftMonth,
  trendSlope,
  trimLeadingEmpty,
  yearOverYear,
} from "./analytics-math";

// Panonun matematiği. Testlerin ağırlığı **dürüstlük kurallarında**: bir
// göstergenin yanlış hesaplanması fark edilir, yetersiz veriden üretilmiş bir
// yüzde edilmez.

const months = (...values: number[]) =>
  values.map((value, i) => ({ month: shiftMonth("2025-01", i), value }));

describe("seri", () => {
  it("hareketli ortalama pencere dolmadan değer üretmiyor", () => {
    const out = movingAverage(months(10, 20, 30, 40), 3);
    expect(out.map((o) => o.value)).toEqual([null, null, 20, 30]);
  });

  it("YoY on iki ay öncesiyle karşılaştırıyor", () => {
    const series = months(...Array.from({ length: 13 }, (_, i) => (i === 0 ? 100 : 0)));
    series[12]!.value = 150;
    const out = yearOverYear(series);
    expect(out[12]!.previous).toBe(100);
    expect(out[12]!.changePct).toBeCloseTo(50);
  });

  it("baştaki boş aylar atılıyor", () => {
    expect(trimLeadingEmpty(months(0, 0, 5, 7)).length).toBe(2);
    // Ortadaki sıfır bir delik değil bir sıfır: atılmıyor.
    expect(trimLeadingEmpty(months(5, 0, 7)).length).toBe(3);
  });
});

describe("yetersiz veri sayı yerine eksiği döndürüyor", () => {
  it("altı aydan az veriyle trend eğimi yok", () => {
    const out = trendSlope(months(1, 2, 3));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.need).toBe(6);
      expect(out.have).toBe(3);
    }
  });

  it("yirmi dört aydan az veriyle CAGR yok", () => {
    expect(cagr(months(...Array(12).fill(100))).ok).toBe(false);
  });

  it("tabanı sıfır olan seride CAGR'ın sebebi ayrı yazılıyor", () => {
    const series = months(...Array(24).fill(0));
    series[23]!.value = 100;
    const out = cagr(series);
    expect(out.ok).toBe(false);
    // "En az 24 ay gerekiyor" demek, 24 ayı olan kullanıcıyı şaşırtır.
    if (!out.ok) expect(out.reason).toBeDefined();
  });

  it("sekiz firmadan az müşteriyle RFM segmenti yok", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      companyId: `c${i}`,
      companyName: `Firma ${i}`,
      recencyDays: i,
      frequency: i,
      monetary: i * 100,
    }));
    expect(rfm(rows).ok).toBe(false);
  });

  it("eğim yeterli veriyle hesaplanıyor", () => {
    const out = trendSlope(months(100, 200, 300, 400, 500, 600));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value).toBeCloseTo(100);
  });
});

describe("ciro köprüsü", () => {
  it("farkı dört parçaya ayırıyor ve toplamları tutuyor", () => {
    const bridge = revenueBridge([
      { companyId: "yeni", previous: 0, current: 500 },
      { companyId: "kayip", previous: 300, current: 0 },
      { companyId: "buyuyen", previous: 100, current: 250 },
      { companyId: "daralan", previous: 400, current: 200 },
    ]);

    expect(bridge.previousTotal).toBe(800);
    expect(bridge.currentTotal).toBe(950);
    expect(bridge.newCustomers).toBe(500);
    expect(bridge.lostCustomers).toBe(-300);
    expect(bridge.expansion).toBe(150);
    expect(bridge.contraction).toBe(-200);

    // Köprünün tek sözü: parçalar farkı tam olarak açıklamalı.
    const sum =
      bridge.newCustomers +
      bridge.lostCustomers +
      bridge.expansion +
      bridge.contraction;
    expect(bridge.previousTotal + sum).toBe(bridge.currentTotal);
  });
});

describe("konsantrasyon", () => {
  it("cironun %80'inin kaç firmadan geldiğini sayıyor", () => {
    const out = concentration([50, 30, 10, 5, 5]);
    expect(out.companiesFor80Pct).toBe(2);
    expect(out.top1Pct).toBeCloseTo(50);
  });

  it("tek müşteride HHI on bine yaklaşıyor", () => {
    expect(concentration([100]).hhi).toBeCloseTo(10_000);
  });

  it("ciro yoksa sıfıra bölmüyor", () => {
    expect(concentration([]).hhi).toBe(0);
  });
});

describe("sessizleşen müşteri", () => {
  const base = {
    companyId: "c1",
    companyName: "Firma",
    lastOrderAt: null,
  };

  it("eşik firmanın kendi periyodunun iki katı", () => {
    // Haftalık alan: 20 gün sessizlik zaten alarm.
    const weekly = quietCustomers([
      { ...base, orderCount: 10, medianIntervalDays: 7, daysSinceLastOrder: 20 },
    ]);
    expect(weekly).toHaveLength(1);

    // Mevsimlik alan: aynı 20 gün hiçbir şey söylemiyor.
    const seasonal = quietCustomers([
      { ...base, orderCount: 10, medianIntervalDays: 60, daysSinceLastOrder: 20 },
    ]);
    expect(seasonal).toHaveLength(0);
  });

  it("üç siparişten az geçmişi olan firma hesaba girmiyor", () => {
    const out = quietCustomers([
      { ...base, orderCount: 2, medianIntervalDays: 5, daysSinceLastOrder: 90 },
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("ürün", () => {
  it("ABC ciro Pareto'suna göre sınıflandırıyor", () => {
    const out = abcClasses([
      { revenue: 800 },
      { revenue: 150 },
      { revenue: 50 },
    ]);
    expect(out.map((r) => r.abc)).toEqual(["A", "B", "C"]);
  });

  it("stok sıfırken devir hızı hesaplanmıyor", () => {
    expect(inventoryTurnover(1000, 0)).toBeNull();
  });

  it("devir hızından DIO çıkıyor", () => {
    const out = inventoryTurnover(1200, 100);
    expect(out?.turnover).toBeCloseTo(12);
    expect(out?.dioDays).toBeCloseTo(365 / 12);
  });
});

describe("nakit", () => {
  it("ciro yokken DSO tanımsız", () => {
    expect(dso(1000, 0, 365)).toBeNull();
  });

  it("DSO gün cinsinden", () => {
    expect(dso(100, 1200, 365)).toBeCloseTo((100 / 1200) * 365);
  });
});

describe("gidişat", () => {
  it("iş gününe göre doğrusal tahmin", () => {
    const out = monthEndProjection({
      achieved: 500,
      businessDaysElapsed: 10,
      businessDaysInMonth: 20,
    });
    expect(out).toBeCloseTo(1000);
  });

  it("mevsimsel indeks doğrusalı eziyor", () => {
    // Geçen yıl bu noktada ayın yalnızca dörtte biri yapılmıştı.
    const out = monthEndProjection({
      achieved: 500,
      businessDaysElapsed: 10,
      businessDaysInMonth: 20,
      seasonalIndex: 0.25,
    });
    expect(out).toBeCloseTo(2000);
  });

  it("hafta sonu iş günü sayılmıyor", () => {
    // 2026-08-03 pazartesi, 2026-08-09 pazar.
    const from = new Date(2026, 7, 3);
    const to = new Date(2026, 7, 9);
    expect(businessDaysBetween(from, to)).toBe(5);
  });

  it("resmî tatil iş gününden düşülüyor", () => {
    // Aynı hafta, çarşamba tam tatil: beş iş günü dörde iniyor.
    const from = new Date(2026, 7, 3);
    const to = new Date(2026, 7, 9);
    const holidays = new Map([[dayKey(new Date(2026, 7, 5)), false]]);
    expect(businessDaysBetween(from, to, holidays)).toBe(4);
  });

  it("arife yarım gün sayılıyor", () => {
    const from = new Date(2026, 7, 3);
    const to = new Date(2026, 7, 9);
    const holidays = new Map([[dayKey(new Date(2026, 7, 5)), true]]);
    expect(businessDaysBetween(from, to, holidays)).toBe(4.5);
  });

  it("hafta sonuna düşen tatil hiçbir şeyi değiştirmiyor", () => {
    // Sayacın iki kez düşmemesi gerekiyor: cumartesi zaten iş günü değil.
    const from = new Date(2026, 7, 3);
    const to = new Date(2026, 7, 9);
    const holidays = new Map([[dayKey(new Date(2026, 7, 8)), false]]);
    expect(businessDaysBetween(from, to, holidays)).toBe(5);
  });

  it("takvim boşken davranış eskisiyle birebir aynı", () => {
    // Tatil girilmemiş bir kurulumda hiçbir sayı oynamamalı.
    const from = new Date(2026, 7, 1);
    const to = new Date(2026, 7, 31);
    expect(businessDaysBetween(from, to, new Map())).toBe(
      businessDaysBetween(from, to),
    );
  });

  it("gün anahtarı yerel gün, UTC değil", () => {
    // `toISOString` gece yarısını bir önceki güne kaydırıyordu.
    expect(dayKey(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(dayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("DATE kolonu UTC anahtarla okunuyor", () => {
    // Postgres `DATE`i sürücü UTC gece yarısı olarak veriyor. Yerel getter'la
    // okunsaydı takvim sunucunun saat dilimine göre kayardı — ilk denemede
    // tam bunu yaptı: 1 Ocak diskte 31 Aralık oldu.
    expect(dayKeyUtc(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01-01");
    expect(dayKeyUtc(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-12-31");
  });
});

describe("ortanca", () => {
  it("tek uzun boşluk ortancayı bozmuyor", () => {
    expect(median([5, 6, 7, 200])).toBeCloseTo(6.5);
  });

  it("boş dizide null", () => {
    expect(median([])).toBeNull();
  });
});
