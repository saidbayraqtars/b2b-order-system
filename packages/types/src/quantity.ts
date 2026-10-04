import { z } from "zod";

// Miktar girişi: adet, kilo, metre.
//
// Miktar kolonları üç ondalık tutar (`Decimal(14, 3)`). Şema yalnızca bu üst
// sınırı denetler; kalemin kendi ölçeği — adet satan kalemde tam sayı, kilo
// satan kalemde üç ondalık — servis katmanında `quantityScale` ile denetlenir,
// çünkü şema hangi kalemin miktarı olduğunu bilmiyor.

/** Miktar kolonlarının ondalık basamağı. */
export const QUANTITY_DECIMALS = 3;

/** Bir kalemin `quantityScale` alanının alabileceği en büyük değer. */
export const MAX_QUANTITY_SCALE = QUANTITY_DECIMALS;

const DEFAULT_MAX = 9_999_999;

function roundQuantity(value: number): number {
  return Number(value.toFixed(QUANTITY_DECIMALS));
}

/**
 * Kayan nokta gürültüsü (istemcide 0,1 + 0,2 = 0,30000000000000004) kabul
 * edilip yuvarlanır; gerçek bir dördüncü ondalık (0,0005) reddedilir.
 */
function fitsDecimals(value: number): boolean {
  return Math.abs(value - roundQuantity(value)) < 1e-9;
}

export interface QuantityOptions {
  /** Sıfır geçerli mi — sayımda "hiç kalmamış" bir cevaptır, siparişte değil. */
  allowZero?: boolean;
  max?: number;
  /** Form alanından gelen metni sayıya çevir. */
  coerce?: boolean;
  /** Sıfır ya da eksi girildiğinde gösterilecek mesaj. */
  message?: string;
}

/** Üç ondalığa kadar miktar; çıktı üç ondalığa yuvarlanmış sayı. */
export function quantityInput(options: QuantityOptions = {}) {
  const base = (options.coerce ? z.coerce.number() : z.number()).finite();
  const bounded = (
    options.allowZero
      ? base.min(0, options.message ?? "Miktar negatif olamaz")
      : base.positive(options.message ?? "Miktar sıfırdan büyük olmalı")
  ).max(options.max ?? DEFAULT_MAX);
  return bounded
    .refine(fitsDecimals, "Miktar en fazla üç ondalık basamak alabilir")
    .transform(roundQuantity);
}

/** Kalemin miktar ölçeği: 0 = tam sayı (adet, koli), 1-3 = kesirli (kg, m). */
export const quantityScaleSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_QUANTITY_SCALE, "En fazla üç ondalık");
