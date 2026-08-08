import { prisma } from "@repo/database";
import { FOREIGN_CURRENCIES } from "@repo/types";
import { Dec } from "./money";

// TCMB (Merkez Bankası) günlük kur bülteni.
//
// Kur elle giriliyordu ve girilmediği gün fiyatlama **duruyordu** — dolarlı bir
// katalogda bu, sabah 9'da satış yapılamaması demek. Bu dosya bülteni çekip
// tabloya yazıyor; elle giriş yerinde duruyor, çünkü kimi satıcı kendi kurunu
// (sabit kur, banka kuru) kullanıyor ve son yazılan satır kazanıyor.
//
// Ayrıştırma düz metin üzerinden yapılıyor, XML kütüphanesiyle değil: bülten
// otuz yıldır aynı biçimde ve tek bir bağımlılık eklemek, tek bir düzenli
// ifadeden daha pahalı.

const BULLETIN_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const TIMEOUT_MS = 15_000;

/** İstanbul sabiti UTC+3 — 2016'dan beri yaz saati uygulaması yok. */
const ISTANBUL_OFFSET_HOURS = 3;

export interface TcmbRate {
  currency: string;
  /** 1 birim yabancı para kaç TL. Bültendeki birim çarpanı düşülmüş hâli. */
  rate: string;
}

export interface TcmbBulletin {
  /** Bültenin geçerli olduğu gün, İstanbul yerel gününün başlangıcı. */
  validFrom: Date;
  rates: TcmbRate[];
}

function tagValue(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

/**
 * Bülteni ayrıştır.
 *
 * **Satış** kuru alınıyor (`ForexSelling`): mal alımı satış kuruyla değerlenir
 * ve alış kurunu kullanmak, her kalemde satıcının aleyhine bir fark bırakırdı.
 * Alış yalnızca satış boşsa yedek.
 *
 * `Unit` göz ardı edilemez: JPY bültende 100 birim üzerinden yazılıyor ve
 * bölünmezse kur yüz katı çıkar.
 */
export function parseBulletin(xml: string): TcmbBulletin {
  const dateMatch = /Tarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!dateMatch) {
    throw new Error("TCMB bülteninde tarih bulunamadı");
  }
  const [, dd, mm, yyyy] = dateMatch;
  const validFrom = new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)) -
      ISTANBUL_OFFSET_HOURS * 3_600_000,
  );

  const wanted = new Set<string>(FOREIGN_CURRENCIES);
  const rates: TcmbRate[] = [];

  for (const block of xml.split("<Currency ").slice(1)) {
    const code = /CurrencyCode="([A-Z]{3})"/.exec(block)?.[1];
    if (!code || !wanted.has(code)) continue;

    const raw = tagValue(block, "ForexSelling") ?? tagValue(block, "ForexBuying");
    const unit = Number(tagValue(block, "Unit") ?? "1");
    if (!raw || !Number.isFinite(unit) || unit <= 0) continue;

    const value = new Dec(raw);
    if (value.lessThanOrEqualTo(0)) continue;

    rates.push({ currency: code, rate: value.dividedBy(unit).toFixed(6) });
  }

  return { validFrom, rates };
}

export async function fetchBulletin(): Promise<TcmbBulletin> {
  const response = await fetch(BULLETIN_URL, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/xml,text/xml" },
  });
  if (!response.ok) {
    throw new Error(`TCMB yanıtı ${response.status}`);
  }
  return parseBulletin(await response.text());
}

export interface TcmbSyncResult {
  /** Bülten günü; hafta sonu ve tatilde son iş gününün bülteni gelir. */
  validFrom: Date;
  written: number;
  currencies: string[];
}

/**
 * Bülteni çekip tabloya yaz.
 *
 * Aynı gün ikinci kez çalıştırmak aynı satırı günceller: tekillik anahtarı
 * (para birimi, geçerlilik başlangıcı) ve geçerlilik başlangıcı bültenin günü.
 * Zamanlayıcı işini saatte bir çalıştırıyor — bülten öğleden sonra yayımlandığı
 * için sabahki turlar dünün satırını tazeliyor, akşamki tur bugünkünü yazıyor.
 *
 * `createdById` boş: satırı bir kullanıcı girmedi. Ekranda "kaynak" sütunu
 * TCMB yazıyor, bu yüzden sahipsiz görünmüyor.
 */
export async function syncTcmbRates(): Promise<TcmbSyncResult> {
  const bulletin = await fetchBulletin();

  for (const { currency, rate } of bulletin.rates) {
    await prisma.exchangeRate.upsert({
      where: {
        currency_validFrom: { currency, validFrom: bulletin.validFrom },
      },
      update: { rate, source: "TCMB" },
      create: {
        currency,
        rate,
        validFrom: bulletin.validFrom,
        source: "TCMB",
      },
    });
  }

  return {
    validFrom: bulletin.validFrom,
    written: bulletin.rates.length,
    currencies: bulletin.rates.map((r) => r.currency),
  };
}
