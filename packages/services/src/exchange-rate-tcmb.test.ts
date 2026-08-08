import { describe, expect, it } from "vitest";
import { parseBulletin } from "./exchange-rate-tcmb";

// TCMB bülteni ayrıştırma.
//
// Ağ yok: sınanan şey biçim. Bültenin iki tuzağı var — birim çarpanı (JPY 100
// birim üzerinden yazılıyor) ve boş alanlar (tatil günlerinde efektif kurlar
// boş geliyor). İkisi de sessizce yanlış bir kur yazdırabilir.

const XML = `<?xml version="1.0" encoding="ISO-8859-9"?>
<Tarih_Date Tarih="08.08.2026" Date="08/08/2026" Bulten_No="2026/151">
<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
<Unit>1</Unit>
<Isim>ABD DOLARI</Isim>
<ForexBuying>41.1000</ForexBuying>
<ForexSelling>41.2000</ForexSelling>
<BanknoteBuying>41.0700</BanknoteBuying>
<BanknoteSelling>41.2600</BanknoteSelling>
</Currency>
<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
<Unit>1</Unit>
<Isim>EURO</Isim>
<ForexBuying>47.8000</ForexBuying>
<ForexSelling>48.0000</ForexSelling>
</Currency>
<Currency CrossOrder="4" Kod="JPY" CurrencyCode="JPY">
<Unit>100</Unit>
<Isim>JAPON YENI</Isim>
<ForexBuying>27.8000</ForexBuying>
<ForexSelling>28.0000</ForexSelling>
</Currency>
<Currency CrossOrder="2" Kod="AUD" CurrencyCode="AUD">
<Unit>1</Unit>
<Isim>AVUSTRALYA DOLARI</Isim>
<ForexBuying>26.5000</ForexBuying>
<ForexSelling>26.7000</ForexSelling>
</Currency>
</Tarih_Date>`;

describe("TCMB bülteni", () => {
  it("satış kurunu alır", () => {
    const { rates } = parseBulletin(XML);
    const usd = rates.find((r) => r.currency === "USD");
    // Alış değil satış: mal alımı satış kuruyla değerlenir.
    expect(usd?.rate).toBe("41.200000");
  });

  it("birim çarpanını böler", () => {
    // Bültende JPY 100 birim üzerinden yazılıyor. Katalogda JPY olmadığı için
    // aynı durum GBP üzerinde kuruluyor: sınanan şey bölme, para birimi değil.
    const xml = XML.replace(
      `<Currency CrossOrder="4" Kod="JPY" CurrencyCode="JPY">
<Unit>100</Unit>`,
      `<Currency CrossOrder="4" Kod="GBP" CurrencyCode="GBP">
<Unit>100</Unit>`,
    );
    const gbp = parseBulletin(xml).rates.find((r) => r.currency === "GBP");
    expect(gbp?.rate).toBe("0.280000");
  });

  it("katalogda olmayan para birimlerini atar", () => {
    const { rates } = parseBulletin(XML);
    // Bülten 20'den fazla para birimi taşıyor; hepsini yazmak, hiç
    // kullanılmayacak satır biriktirmek olurdu.
    expect(rates.some((r) => r.currency === "AUD")).toBe(false);
    expect(rates.some((r) => r.currency === "JPY")).toBe(false);
    expect(rates.map((r) => r.currency).sort()).toEqual(["EUR", "USD"]);
  });

  it("bülten gününü İstanbul gününün başlangıcı olarak okur", () => {
    const { validFrom } = parseBulletin(XML);
    // 08.08.2026 00:00 (UTC+3) = 07.08.2026 21:00 UTC. Tekrar çalıştırmada
    // aynı satırın güncellenmesini sağlayan şey bu belirlilik.
    expect(validFrom.toISOString()).toBe("2026-08-07T21:00:00.000Z");
  });

  it("satış kuru boşsa alışa düşer", () => {
    const xml = XML.replace(
      "<ForexSelling>41.2000</ForexSelling>",
      "<ForexSelling></ForexSelling>",
    );
    const usd = parseBulletin(xml).rates.find((r) => r.currency === "USD");
    expect(usd?.rate).toBe("41.100000");
  });

  it("iki kur da boşsa o para birimini yazmaz", () => {
    // Kurun hiç yazılmaması, yanlış yazılmasından iyi: fiyatlama duruyor ve
    // operatör eksik kuru ekranda görüyor.
    const xml = XML.replace(
      "<ForexBuying>41.1000</ForexBuying>\n<ForexSelling>41.2000</ForexSelling>",
      "<ForexBuying></ForexBuying>\n<ForexSelling></ForexSelling>",
    );
    const rates = parseBulletin(xml).rates;
    expect(rates.some((r) => r.currency === "USD")).toBe(false);
    expect(rates.some((r) => r.currency === "EUR")).toBe(true);
  });

  it("tarihsiz bülten hatadır", () => {
    expect(() => parseBulletin("<Tarih_Date></Tarih_Date>")).toThrow();
  });
});
