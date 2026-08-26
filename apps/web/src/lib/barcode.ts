import type { CatalogProduct, CatalogVariant } from "@repo/services";

// El terminali / USB barkod okuyucu klavye gibi yazar: kodu tuşlar, sonuna
// Enter basar. Bu yüzden kamera ya da kütüphane gerekmiyor — gereken tek şey,
// arama kutusundaki Enter'ın "filtrele" değil "bu kodu bul" anlamına gelmesi.
//
// Sipariş hazırlarken art arda okutma esas kullanım: eşleşen tek varyant
// doğrudan sepete gider, kutu temizlenir, sıradaki ürün okutulur.

export interface ScanMatch {
  product: CatalogProduct;
  variant: CatalogVariant;
}

/**
 * Kod karşılaştırması büyük/küçük harf duyarsız ve kenar boşluklarından
 * bağımsız. Türkçe yerel ayarı iki tarafa da uygulandığı için "i/İ" farkı
 * karşılaştırmayı bozmuyor.
 */
function norm(value: string): string {
  return value.trim().toLocaleUpperCase("tr");
}

/**
 * Okutulan kodun **birebir** karşılığı olan tek varyantı bulur.
 *
 * Sunucudaki arama `contains` ile çalışıyor: "8690" araması onlarca ürün
 * getirebilir. Sepete atma kararı bu yüzden burada, tam eşleşmeye bakılarak
 * veriliyor — yanlış ürünü sepete koymaktansa listeyi filtrelenmiş bırakmak
 * daha iyi.
 *
 * Barkod, SKU'dan önce gelir: okuyucudan gelen şey barkoddur, aynı dizgi başka
 * bir ürünün SKU'suna denk gelse bile barkod sahibi kazanır. Aynı seviyede
 * birden fazla aday varsa (aynı barkod iki varyantta) eşleşme sayılmaz —
 * hangisinin isteneceğini kimse bilemez.
 */
export function findScannedVariant(
  products: readonly CatalogProduct[],
  term: string,
): ScanMatch | null {
  const code = norm(term);
  if (!code) return null;

  const byBarcode: ScanMatch[] = [];
  const bySku: ScanMatch[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.barcode && norm(variant.barcode) === code) {
        byBarcode.push({ product, variant });
      } else if (norm(variant.sku) === code) {
        bySku.push({ product, variant });
      }
    }
  }

  const hits = byBarcode.length ? byBarcode : bySku;
  return hits.length === 1 ? hits[0]! : null;
}

/** Sepete atılabilir mi: fiyatı çözülmüş ve en az bir asgari sipariş kadar stok var. */
export function isScanOrderable(variant: CatalogVariant): boolean {
  return variant.netUnitPrice !== null && variant.stock >= variant.moqUnits;
}
