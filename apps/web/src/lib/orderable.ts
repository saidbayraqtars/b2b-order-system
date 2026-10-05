import type { CatalogVariant } from "@repo/services";
import { formatQuantity } from "./format";
import { isFractional } from "./quantity";

// Bir kalem neden sepete girmiyor — kartta, detayda ve okutmada aynı cevap.
//
// Üç sebep var ve kullanıcıya üçü ayrı söylenmeli. Özellikle üçüncüsü: stokta
// 14 adet var ama koli 24'lük ve asgari sipariş bir koli. Kart önce "Sınırlı
// stok (14 adet)" yazıp düğmeyi sessizce kapatıyordu; detay aynı satıra "stok
// yok" diyordu. İkisi de yanlış bir şey söylemiyordu ama kimse neden
// alamadığını anlamıyordu.

export type OrderBlock =
  | { kind: "price" }
  | { kind: "stock" }
  /** Stok var ama asgari sipariş miktarından az. */
  | { kind: "moq"; stock: number; moq: number };

type Rule = Pick<
  CatalogVariant,
  "netUnitPrice" | "stock" | "moqUnits" | "unit" | "quantityScale"
>;

/** Sepete girebiliyorsa null; giremiyorsa sebebi. Fiyat önce: fiyatsız kalem stoğu ne olursa olsun satılmaz. */
export function orderBlock(v: Rule): OrderBlock | null {
  if (v.netUnitPrice === null) return { kind: "price" };
  if (v.stock >= v.moqUnits) return null;
  if (v.stock <= 0) return { kind: "stock" };
  return { kind: "moq", stock: v.stock, moq: v.moqUnits };
}

/** Kesirli kalemde kendi birimi (kg, m), ötekilerde "adet". */
function unitWord(v: Rule): string {
  return isFractional(v) && v.unit ? v.unit.toLocaleLowerCase("tr") : "adet";
}

/** Tek satırlık açıklama: "en az 24 adet alınır, stokta 14". */
export function orderBlockLabel(block: OrderBlock, v: Rule): string {
  switch (block.kind) {
    case "price":
      return "fiyat tanımsız";
    case "stock":
      return "stok yok";
    case "moq":
      return `en az ${formatQuantity(block.moq)} ${unitWord(v)} alınır, stokta ${formatQuantity(block.stock)}`;
  }
}
