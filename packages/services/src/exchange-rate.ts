import { type Prisma, prisma } from "@repo/database";
import {
  BASE_CURRENCY,
  type Currency,
  type ExchangeRateInput,
  FOREIGN_CURRENCIES,
  isBaseCurrency,
} from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, round2 } from "./money";

type Tx = Prisma.TransactionClient;

// Kur tablosu ve çevrim.
//
// Buranın tek işi bir sayıyı TL'ye çevirmek. Kurun *ne zaman* okunduğu kadar
// önemli olan, okunmadığında ne olduğu: kuru girilmemiş bir para birimiyle
// fiyatlama **durur**. Sessizce 1 kabul etmek, 100 dolarlık malı 100 liraya
// satmak demekti — ve bu tam olarak fark edilmesi en geç olan hata türü.

/** Para birimi → 1 birimin kaç TL ettiği. TRY her zaman 1. */
export type RateMap = ReadonlyMap<string, Prisma.Decimal>;

const ONE = new Dec(1);

/**
 * Şu an geçerli kurlar: her para birimi için `validFrom <= now` olan en son
 * satır.
 *
 * Tek sorguda çekiliyor (`DISTINCT ON`), para birimi başına ayrı sorgu değil:
 * katalog listesi her istekte çağırıyor ve dört ayrı gidiş-dönüş, sayfanın
 * açılış süresine doğrudan ekleniyor.
 */
export async function currentRates(at?: Date): Promise<RateMap> {
  const when = at ?? new Date();
  const rows = await prisma.$queryRaw<Array<{ currency: string; rate: Prisma.Decimal }>>`
    SELECT DISTINCT ON ("currency") "currency", "rate"
    FROM "ExchangeRate"
    WHERE "validFrom" <= ${when}
    ORDER BY "currency", "validFrom" DESC
  `;

  const map = new Map<string, Prisma.Decimal>();
  map.set(BASE_CURRENCY, ONE);
  for (const r of rows) map.set(r.currency, new Dec(r.rate));
  return map;
}

/**
 * Tutarı TL'ye çevir.
 *
 * Kuru bilinmeyen para birimi **hata**. Fiyatlamanın durması, yanlış fiyattan
 * satmaktan iyidir: ikincisi ancak fatura kesildikten sonra fark ediliyor.
 */
export function toBase(
  amount: Prisma.Decimal | number | string,
  currency: string,
  rates: RateMap,
): Prisma.Decimal {
  const value = new Dec(amount);
  if (isBaseCurrency(currency)) return value;

  const rate = rates.get(currency.toUpperCase());
  if (!rate) {
    throw new BusinessError(
      "MISSING_EXCHANGE_RATE",
      `${currency} için kur girilmemiş; bu para birimindeki ürünler fiyatlanamıyor`,
      { currency },
    );
  }
  return round2(value.mul(rate));
}

/** Çevrimde kullanılan kur — siparişe yazmak için. */
export function rateFor(currency: string, rates: RateMap): Prisma.Decimal {
  if (isBaseCurrency(currency)) return ONE;
  const rate = rates.get(currency.toUpperCase());
  if (!rate) {
    throw new BusinessError(
      "MISSING_EXCHANGE_RATE",
      `${currency} için kur girilmemiş`,
      { currency },
    );
  }
  return rate;
}

/**
 * Fiyat satırlarını TL'ye çevir.
 *
 * Çevrim **fiyatlamadan önce** yapılıyor. Böylece iskonto, hacim kademesi, KDV
 * ve toplamlar tek para biriminde hesaplanıyor ve `resolvePrice` döviz diye bir
 * şey bilmiyor. Alternatif — her adımda para birimi taşımak — dört ayrı yerde
 * yuvarlama kararı demekti.
 */
export function convertPriceRows<
  T extends { price: Prisma.Decimal; currency?: string | null },
>(rows: readonly T[], rates: RateMap): Array<T & { listPrice: Prisma.Decimal }> {
  return rows.map((row) => {
    const currency = (row.currency ?? BASE_CURRENCY).toUpperCase();
    // Orijinal tutar `listPrice` olarak taşınıyor: belgede "100 USD × 34,2150"
    // basılacak ve bunu kurdan geri hesaplamak kuruş oynatıyor.
    if (isBaseCurrency(currency)) return { ...row, listPrice: row.price };
    return {
      ...row,
      currency,
      listPrice: row.price,
      price: toBase(row.price, currency, rates),
    };
  });
}

/**
 * Bir varyantın fiyatının hangi para biriminde listelendiği.
 *
 * Satırlar farklı para birimlerinde olabilir (grup fiyatı dolar, liste fiyatı
 * TL). Sipariş satırına yazılacak olan, **seçilen** kademenin para birimi;
 * burada yalnızca "hepsi aynı mı" sorusu yanıtlanıyor ve karışıksa taban kabul
 * ediliyor — belgede yanlış para birimi basmaktansa yalnızca TL basmak yeğdir.
 */
export function dominantCurrency(
  rows: readonly { currency?: string | null }[],
): string {
  const found = new Set(rows.map((r) => (r.currency ?? BASE_CURRENCY).toUpperCase()));
  if (found.size === 1) return [...found][0]!;
  return BASE_CURRENCY;
}

// ─────────────────────────────────────────────
// YÖNETİM
// ─────────────────────────────────────────────

export interface ExchangeRateRecord {
  id: string;
  currency: string;
  rate: string;
  validFrom: string;
  source: string;
  createdByName: string | null;
}

export async function listExchangeRates(
  currency?: string,
  limit = 100,
): Promise<ExchangeRateRecord[]> {
  const rows = await prisma.exchangeRate.findMany({
    where: currency ? { currency } : {},
    orderBy: [{ validFrom: "desc" }, { currency: "asc" }],
    take: Math.min(limit, 500),
    select: {
      id: true,
      currency: true,
      rate: true,
      validFrom: true,
      source: true,
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    currency: r.currency,
    rate: new Dec(r.rate).toFixed(4),
    validFrom: r.validFrom.toISOString(),
    source: r.source,
    createdByName: r.createdBy?.name ?? null,
  }));
}

/** Şu anki kurlar + hangisinin eksik olduğu — ekranın üst şeridi. */
export interface CurrentRateRow {
  currency: Currency;
  rate: string | null;
  validFrom: string | null;
  /** Kuru hiç girilmemiş: bu para birimindeki ürünler satılamaz. */
  missing: boolean;
  /** Kur bir günden eskiyse operatör uyarılıyor. */
  staleHours: number | null;
}

export async function getCurrentRates(): Promise<CurrentRateRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{ currency: string; rate: Prisma.Decimal; validFrom: Date }>
  >`
    SELECT DISTINCT ON ("currency") "currency", "rate", "validFrom"
    FROM "ExchangeRate"
    WHERE "validFrom" <= NOW()
    ORDER BY "currency", "validFrom" DESC
  `;
  const byCurrency = new Map(rows.map((r) => [r.currency, r]));

  return FOREIGN_CURRENCIES.map((currency) => {
    const row = byCurrency.get(currency);
    return {
      currency,
      rate: row ? new Dec(row.rate).toFixed(4) : null,
      validFrom: row ? row.validFrom.toISOString() : null,
      missing: !row,
      staleHours: row
        ? Math.floor((Date.now() - row.validFrom.getTime()) / 3_600_000)
        : null,
    };
  });
}

/**
 * Yeni kur yaz.
 *
 * Güncelleme değil, **ekleme**: bir siparişin hangi kurla fiyatlandığı sorusu
 * ancak o günün satırı yerinde durursa yanıtlanabilir. Aynı ana ikinci kez kur
 * girilirse (düzeltme) o satır güncelleniyor — aynı anda iki farklı kur
 * geçerli olamaz.
 */
export async function recordExchangeRate(
  input: ExchangeRateInput,
  createdById: string,
): Promise<{ id: string }> {
  const validFrom = input.validFrom ?? new Date();
  const rate = new Dec(input.rate);

  return prisma.exchangeRate.upsert({
    where: { currency_validFrom: { currency: input.currency, validFrom } },
    update: { rate, source: input.source ?? "MANUAL" },
    create: {
      currency: input.currency,
      rate,
      validFrom,
      source: input.source ?? "MANUAL",
      createdBy: { connect: { id: createdById } },
    },
    select: { id: true },
  });
}

/** İşlem içinden kur okuma — sipariş yazılırken aynı işlemde gerekiyor. */
export async function currentRatesTx(tx: Tx, at?: Date): Promise<RateMap> {
  const when = at ?? new Date();
  const rows = await tx.$queryRaw<Array<{ currency: string; rate: Prisma.Decimal }>>`
    SELECT DISTINCT ON ("currency") "currency", "rate"
    FROM "ExchangeRate"
    WHERE "validFrom" <= ${when}
    ORDER BY "currency", "validFrom" DESC
  `;
  const map = new Map<string, Prisma.Decimal>();
  map.set(BASE_CURRENCY, ONE);
  for (const r of rows) map.set(r.currency, new Dec(r.rate));
  return map;
}
