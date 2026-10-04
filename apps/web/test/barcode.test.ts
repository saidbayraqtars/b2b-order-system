import { describe, expect, it } from "vitest";
import type { CatalogProduct, CatalogVariant } from "@repo/services";
import { findScannedVariant, isScanOrderable } from "@/lib/barcode";

// Okutulan kodu sepete çeviren tek karar noktası burası: sunucudaki arama
// `contains` ile çalıştığı için "8690" gibi bir parça onlarca ürün getirir,
// hangisinin gerçekten okutulduğuna bu fonksiyon karar verir. Yanlış ürünü
// sepete koymak, hiç koymamaktan pahalı.

function variant(over: Partial<CatalogVariant> = {}): CatalogVariant {
  return {
    id: "v1",
    sku: "SKU-1",
    barcode: "8690000000001",
    color: null,
    size: null,
    unitsPerCase: 6,
    moqUnits: 6,
    stock: 60,
    unit: null,
    quantityScale: 0,
    unitPrice: "100.00",
    discountPerUnit: "0.00",
    netUnitPrice: "100.00",
    listCurrency: null,
    listUnitPrice: null,
    units: [],
    ...over,
  };
}

function product(
  variants: CatalogVariant[],
  over: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    id: "p1",
    name: "Ürün",
    slug: "urun",
    brand: null,
    images: [],
    vatRate: 20,
    categoryId: "c1",
    variants,
    ...over,
  };
}

describe("findScannedVariant", () => {
  it("finds the single variant whose barcode matches exactly", () => {
    const hit = variant({ id: "v-hit" });
    const products = [
      product([variant({ id: "v-other", barcode: "8690000000002" })], {
        id: "p-other",
      }),
      product([hit], { id: "p-hit" }),
    ];

    expect(findScannedVariant(products, "8690000000001")?.variant.id).toBe(
      "v-hit",
    );
  });

  it("ignores partial matches — a prefix is a filter, not a scan", () => {
    const products = [product([variant()])];
    expect(findScannedVariant(products, "8690")).toBeNull();
  });

  it("falls back to the SKU when no barcode matches", () => {
    const products = [product([variant({ barcode: null, sku: "ABC-9" })])];
    expect(findScannedVariant(products, "abc-9")?.variant.sku).toBe("ABC-9");
  });

  it("prefers the barcode owner when the same string is another SKU", () => {
    const products = [
      product([variant({ id: "v-sku", barcode: null, sku: "5555" })], {
        id: "p-sku",
      }),
      product([variant({ id: "v-barcode", barcode: "5555", sku: "X-1" })], {
        id: "p-barcode",
      }),
    ];
    expect(findScannedVariant(products, "5555")?.variant.id).toBe("v-barcode");
  });

  it("refuses to guess when two variants carry the same barcode", () => {
    const products = [
      product([variant({ id: "a" })], { id: "p-a" }),
      product([variant({ id: "b" })], { id: "p-b" }),
    ];
    expect(findScannedVariant(products, "8690000000001")).toBeNull();
  });

  it("tolerates the whitespace a reader appends and case in a SKU", () => {
    const products = [product([variant({ barcode: null, sku: "sku-Ix" })])];
    expect(findScannedVariant(products, "  SKU-IX  ")?.variant.sku).toBe(
      "sku-Ix",
    );
  });

  it("treats an empty term as no scan at all", () => {
    const products = [product([variant({ barcode: null })])];
    expect(findScannedVariant(products, "   ")).toBeNull();
  });
});

describe("isScanOrderable", () => {
  it("rejects a variant with no price for this company", () => {
    expect(isScanOrderable(variant({ netUnitPrice: null }))).toBe(false);
  });

  it("rejects a variant that cannot cover its minimum order quantity", () => {
    expect(isScanOrderable(variant({ stock: 5, moqUnits: 6 }))).toBe(false);
  });

  it("accepts a priced variant with stock at the minimum", () => {
    expect(isScanOrderable(variant({ stock: 6, moqUnits: 6 }))).toBe(true);
  });
});

describe("paket barkodu (F2)", () => {
  const koli = {
    id: "u-koli",
    name: "KOLİ",
    factor: 12,
    barcode: "8690000000099",
    unitPrice: "1200.00",
    netUnitPrice: "1100.00",
  };

  it("koli barkodu kalemi ve koli birimini birlikte bulur", () => {
    const products = [product([variant({ units: [koli] })])];
    const hit = findScannedVariant(products, "8690000000099");
    expect(hit?.variant.id).toBe("v1");
    expect(hit?.unit?.id).toBe("u-koli");
  });

  it("kalemin kendi barkodu birimsiz eşleşir", () => {
    const products = [product([variant({ units: [koli] })])];
    expect(findScannedVariant(products, "8690000000001")?.unit).toBeNull();
  });

  it("stok bir koliyi karşılamıyorsa koli okutması sepete gitmez", () => {
    expect(isScanOrderable(variant({ stock: 11, units: [koli] }), koli)).toBe(false);
    expect(isScanOrderable(variant({ stock: 12, units: [koli] }), koli)).toBe(true);
  });

  it("koli fiyatı yoksa koli okutması sepete gitmez", () => {
    const fiyatsiz = { ...koli, netUnitPrice: null };
    expect(isScanOrderable(variant({ units: [fiyatsiz] }), fiyatsiz)).toBe(false);
  });
});
