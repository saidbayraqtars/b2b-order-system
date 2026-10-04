// Miktar girişi: adet mi, kilo mu.
//
// Kalemin `quantityScale`'i kaç ondalık girilebileceğini söyler (0 = tam sayı,
// 3 = gram hassasiyetinde kilo). Sunucu aynı kuralı ayrıca denetliyor; buradaki
// iş, kullanıcının yazdığını sunucunun reddetmeyeceği bir sayıya getirmek ve
// sayı kutusuna doğru adımı vermek.

export interface QuantityRule {
  unitsPerCase: number;
  moqUnits: number;
  stock: number;
  /** Eski yanıtlarda yok; yoksa tam sayı. */
  quantityScale?: number;
}

function factor(scale: number): number {
  return 10 ** Math.min(Math.max(Math.trunc(scale), 0), 3);
}

/** Miktarı kalemin ölçeğine yuvarla — yukarı ya da aşağı. */
export function roundToScale(
  value: number,
  scale: number,
  mode: "up" | "down" | "nearest" = "nearest",
): number {
  const f = factor(scale);
  // 1e-9: 0,75 × 1000 = 750,0000000000001 gibi gürültü bir adım yukarı itmesin.
  const scaled = value * f;
  const n =
    mode === "up"
      ? Math.ceil(scaled - 1e-9)
      : mode === "down"
        ? Math.floor(scaled + 1e-9)
        : Math.round(scaled);
  return n / f;
}

/**
 * Sayı kutusunun `step` değeri. Koli kalemi koli katında, kilo kalemi
 * ölçeğinin en küçük biriminde (0,001), adet kalemi birer birer ilerler.
 */
export function quantityStep(rule: Pick<QuantityRule, "unitsPerCase" | "quantityScale">): number {
  if (rule.unitsPerCase > 1) return rule.unitsPerCase;
  return 1 / factor(rule.quantityScale ?? 0);
}

/** Kalemin ölçeği kesirli mi — mobil klavyede ondalık tuşu gerekiyor mu. */
export function isFractional(rule: Pick<QuantityRule, "quantityScale">): boolean {
  return (rule.quantityScale ?? 0) > 0;
}

/**
 * Kutuya yazılan miktarı sayıya çevir. Türkçe klavyede "0,75" yazılır; virgül
 * varsa ondalık ayırıcı odur ve noktalar binlik sayılır. Virgül yoksa yazılan
 * olduğu gibi okunur ("0.75" de geçerli).
 */
export function parseQuantity(text: string): number {
  const t = text.trim().replace(/\s/g, "");
  if (t === "") return Number.NaN;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return Number(normalized);
}

/** Ürün formundaki ölçek seçenekleri. */
export const QUANTITY_SCALE_OPTIONS = [
  { value: 0, label: "Tam sayı (adet, koli)" },
  { value: 1, label: "1 ondalık (0,5)" },
  { value: 2, label: "2 ondalık (0,25)" },
  { value: 3, label: "3 ondalık (0,125 — gram)" },
] as const;
