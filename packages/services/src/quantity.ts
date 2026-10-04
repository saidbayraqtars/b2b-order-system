import { Prisma } from "@repo/database";
import { BusinessError } from "./errors";

// Miktar: adet, kilo, metre.
//
// Kolonlar `Decimal(14, 3)`: kilo ve metre satan kurulum 0,75 kg tutabilmeli.
// Uygulamanın geri kalanı miktarı **sayı** olarak taşır — API sözleşmesi
// (web ve mobil istemci) bugüne kadar sayıydı ve öyle kalıyor; tam sayı satan
// kurulum hiçbir fark görmez.
//
// Tek kural: miktarlar `+` ve `-` ile toplanmaz. 1 − 0,3 − 0,7 sayı olarak
// sıfır etmiyor (5,55e-17), ve "kalan sevk edilecek miktar sıfır mı" sorusu
// tam bu hesabı yapıyor: kısmi sevk edilmiş bir satır sonsuza kadar açık
// kalırdı. Toplama ve çıkarma burada, ondalıkta yapılır.

/** Kolonların tuttuğu ondalık basamak — `@db.Decimal(14, 3)`. */
export const QUANTITY_DECIMALS = 3;

/** Bir kalemin girişte izin verdiği en büyük ölçek. */
export const MAX_QUANTITY_SCALE = QUANTITY_DECIMALS;

export type QuantityLike = Prisma.Decimal | number | string;

function toDecimal(value: QuantityLike): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Kolondan ya da girişten gelen miktarı üç ondalığa yuvarlanmış sayıya çevir. */
export function qty(value: QuantityLike | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return toDecimal(value)
    .toDecimalPlaces(QUANTITY_DECIMALS, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** `qty`'nin boşu boş bırakan hâli — kritik seviye gibi isteğe bağlı alanlar için. */
export function qtyOrNull(value: QuantityLike | null | undefined): number | null {
  return value === null || value === undefined ? null : qty(value);
}

/** Miktarları ondalıkta topla. */
export function qtyAdd(...values: Array<QuantityLike | null | undefined>): number {
  let sum = new Prisma.Decimal(0);
  for (const v of values) {
    if (v !== null && v !== undefined) sum = sum.plus(toDecimal(v));
  }
  return qty(sum);
}

/** `a − b`, ondalıkta. */
export function qtySub(a: QuantityLike, b: QuantityLike | null | undefined): number {
  return qty(toDecimal(a).minus(b === null || b === undefined ? 0 : toDecimal(b)));
}

/** `a × b`, ondalıkta — koli sayısından miktara, oranlı paylaştırmaya. */
export function qtyMul(a: QuantityLike, b: QuantityLike): number {
  return qty(toDecimal(a).times(toDecimal(b)));
}

/** Miktar en fazla `scale` ondalık basamak mı taşıyor? */
export function fitsQuantityScale(quantity: number, scale: number): boolean {
  if (!Number.isFinite(quantity)) return false;
  const places = Math.min(Math.max(Math.trunc(scale), 0), MAX_QUANTITY_SCALE);
  return new Prisma.Decimal(quantity).decimalPlaces() <= places;
}

/**
 * Girilen miktarı kalemin ölçeğine göre denetle.
 *
 * Ölçek 0 olan kalemde (adet, koli) 1,5 bir yazım hatasıdır, sessizce
 * yuvarlamak müşteriye istemediği bir miktarı sattırırdı. Bu yüzden
 * reddedilir ve mesaj kaç ondalığa izin verildiğini söyler.
 */
export function assertQuantityScale(
  quantity: number,
  scale: number,
  label?: string,
): void {
  if (fitsQuantityScale(quantity, scale)) return;
  const prefix = label ? `${label}: ` : "";
  throw new BusinessError(
    "INVALID_QUANTITY",
    scale <= 0
      ? `${prefix}miktar tam sayı olmalı`
      : `${prefix}miktar en fazla ${scale} ondalık basamak alabilir`,
    { quantity, quantityScale: scale },
  );
}

/** Ekranda ve belgede miktar: gereksiz sıfır yok, en fazla üç ondalık (1,5 · 0,75 · 12). */
/** Satırın paket birimi: ad ve kaç taban birim ettiği. */
export interface PackageUnit {
  name: string;
  factor: QuantityLike;
}

/** Taban birimdeki miktar kaç paket eder. */
export function packageCount(quantity: QuantityLike, factor: QuantityLike): number {
  return new Prisma.Decimal(quantity.toString()).div(factor.toString()).toNumber();
}

/**
 * Paketle alınan satır tam paket olmalı: 1,5 koli sipariş edilmez. Miktar
 * taban birimde gelir (2 koli = 24 adet), burada paket sayısına çevrilip
 * denetlenir.
 */
export function assertWholePackages(
  quantity: QuantityLike,
  unit: PackageUnit,
  label: string,
  baseUnit?: string | null,
): void {
  const count = new Prisma.Decimal(quantity.toString()).div(unit.factor.toString());
  if (count.isInteger() && count.gt(0)) return;
  throw new BusinessError(
    "INVALID_QUANTITY",
    `${label}: ${unit.name} tam sayı olmalı (1 ${unit.name} = ${formatQuantity(unit.factor)} ${baseUnit ?? "adet"})`,
    { label, unit: unit.name, factor: qty(unit.factor), quantity: qty(quantity) },
  );
}

export function formatQuantity(value: QuantityLike | null | undefined): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: QUANTITY_DECIMALS,
  }).format(qty(value));
}
