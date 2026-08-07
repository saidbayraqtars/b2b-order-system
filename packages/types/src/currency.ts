import { z } from "zod";

// ─────────────────────────────────────────────
// PARA BİRİMİ & KUR
// ─────────────────────────────────────────────
//
// Mimari karar (kullanıcının kendi kararı): **defter TL, kur siparişte donar.**
//
// Ürün dolarla listelenebiliyor, ama cari, kasa, fatura ve rapor tek para
// biriminde — TL. Çok para birimli defter tutmak, her bakiyeye "hangi kurla"
// sorusunu ekler ve tek bir ekstre basılamaz hâle gelir. Yabancı para yalnızca
// **liste fiyatının** özelliği; sipariş anında TL'ye çevriliyor ve kullanılan
// kur siparişe yazılıyor. Böylece dün 34,20'den satılan mal, bugün kur 35 oldu
// diye geriye dönük pahalılaşmıyor.

/** Taban para birimi. Defterin tamamı bunun cinsinden. */
export const BASE_CURRENCY = "TRY";

export const CurrencyEnum = z.enum(["TRY", "USD", "EUR", "GBP"]);
export type Currency = z.infer<typeof CurrencyEnum>;

export const CURRENCIES = CurrencyEnum.options;

export const CURRENCY_LABELS: Record<Currency, string> = {
  TRY: "Türk Lirası",
  USD: "ABD Doları",
  EUR: "Euro",
  GBP: "İngiliz Sterlini",
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/** Yabancı olanlar — kuru girilmesi gerekenler. */
export const FOREIGN_CURRENCIES = CURRENCIES.filter((c) => c !== BASE_CURRENCY);

export function isBaseCurrency(currency: string): boolean {
  return currency.toUpperCase() === BASE_CURRENCY;
}

/**
 * Kur girişi.
 *
 * `validFrom` isteğe bağlı: verilmezse "şimdi". Geçmişe kur girmek mümkün
 * (dünkü kur unutulduysa), ama girilen kur **geçmiş siparişleri değiştirmez** —
 * onlarda kullanılan kur zaten satırlarında yazılı.
 */
export const exchangeRateSchema = z.object({
  currency: CurrencyEnum.refine((c) => c !== BASE_CURRENCY, {
    message: "Taban para biriminin kuru girilmez",
  }),
  /** 1 birim yabancı para kaç TL. */
  rate: z.coerce
    .number()
    .positive("Kur sıfırdan büyük olmalı")
    .max(1_000_000, "Kur makul aralıkta olmalı"),
  validFrom: z.coerce.date().optional(),
  source: z.string().max(40).optional(),
});
export type ExchangeRateInput = z.infer<typeof exchangeRateSchema>;

/** Bir tutarın hangi para biriminde listelendiği ve TL karşılığı. */
export interface MoneyInCurrency {
  /** Listelendiği para birimi. */
  currency: Currency;
  /** O para birimindeki tutar. */
  amount: string;
  /** Kullanılan kur (TRY için 1). */
  rate: string;
  /** TL karşılığı — deftere yazılan sayı. */
  baseAmount: string;
}
