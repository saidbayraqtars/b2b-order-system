import { describe, expect, it } from "vitest";
import type { CatalogVariant } from "@repo/services";
import { orderBlock, orderBlockLabel } from "@/lib/orderable";

// Kalem neden sepete girmiyor: katalog kartı, ürün detayı ve kartın kapalı
// düğmesi aynı cevabı veriyor. En çok karışan hâl stok var ama asgari
// siparişten az (14 adet var, koli 24'lük): kart "Sınırlı stok" yazıp düğmeyi
// sessizce kapatıyor, detay "stok yok" diyordu.

type Rule = Pick<
  CatalogVariant,
  "netUnitPrice" | "stock" | "moqUnits" | "unit" | "quantityScale"
>;

function v(over: Partial<Rule> = {}): Rule {
  return {
    netUnitPrice: "100.00",
    stock: 60,
    moqUnits: 24,
    unit: null,
    quantityScale: 0,
    ...over,
  };
}

describe("orderBlock", () => {
  it("fiyatı ve asgari kadar stoğu olan kalem sepete girer", () => {
    expect(orderBlock(v())).toBeNull();
    expect(orderBlock(v({ stock: 24 }))).toBeNull();
  });

  it("fiyatsız kalem stoğu ne olursa olsun girmez — sebep fiyat", () => {
    const block = orderBlock(v({ netUnitPrice: null, stock: 0 }));
    expect(block).toEqual({ kind: "price" });
    expect(orderBlockLabel(block!, v())).toBe("fiyat tanımsız");
  });

  it("stoğu sıfır olan kalem: stok yok", () => {
    const block = orderBlock(v({ stock: 0 }));
    expect(block).toEqual({ kind: "stock" });
    expect(orderBlockLabel(block!, v())).toBe("stok yok");
  });

  it("stok asgarinin altında: kaç alınır, kaç var", () => {
    const rule = v({ stock: 14 });
    const block = orderBlock(rule);
    expect(block).toEqual({ kind: "moq", stock: 14, moq: 24 });
    expect(orderBlockLabel(block!, rule)).toBe("en az 24 adet alınır, stokta 14");
  });

  it("kesirli kalemde kendi birimiyle söyler", () => {
    const rule = v({ stock: 0.75, moqUnits: 1, unit: "KG", quantityScale: 3 });
    const block = orderBlock(rule);
    expect(block?.kind).toBe("moq");
    expect(orderBlockLabel(block!, rule)).toBe("en az 1 kg alınır, stokta 0,75");
  });

  it("hizmet (stok 999.999) her zaman girer", () => {
    expect(orderBlock(v({ stock: 999_999, moqUnits: 1 }))).toBeNull();
  });
});
