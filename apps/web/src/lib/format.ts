import { BASE_CURRENCY } from "@repo/types";

const TRY = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});

/** Format a number or numeric string as Turkish Lira. */
export function formatTRY(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return TRY.format(Number.isFinite(n) ? n : 0);
}

// Para birimi başına biçimlendirici önbelleği. `Intl.NumberFormat` kurulumu
// pahalıdır ve fatura satırında ürün sayısı kadar çağrılıyor.
const formatters = new Map<string, Intl.NumberFormat>([[BASE_CURRENCY, TRY]]);

/**
 * Tutarı kendi para biriminde biçimlendir.
 *
 * `formatTRY` yerine geçmiyor, yanında duruyor: defterin tamamı TL ve oradaki
 * 30+ çağrı doğru. Bu, yalnızca yabancı parayla **listelenmiş** bir sayıyı
 * kendi biriminde göstermek için.
 */
export function formatMoney(value: number | string, currency: string): string {
  const n = typeof value === "string" ? Number(value) : value;
  const safe = Number.isFinite(n) ? n : 0;
  const code = currency.toUpperCase();

  let fmt = formatters.get(code);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: code });
    } catch {
      // Bilinmeyen bir ISO kodu (ERP'den gelmiş olabilir) sayfayı düşürmemeli;
      // sayı gösterilip kodu yanına yazılıyor.
      fmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 });
    }
    formatters.set(code, fmt);
  }
  const out = fmt.format(safe);
  return fmt.resolvedOptions().style === "currency" ? out : `${out} ${code}`;
}

/**
 * Kur gösterimi — dört ondalık.
 *
 * İki basamağa yuvarlamak belgede basılan çarpımı tutmaz hâle getiriyor:
 * 100 × 34,21 ile 100 × 34,2150 arasında 15 kuruş var ve fatura kontrol eden
 * kişi o farkı hesap hatası sanıyor.
 */
export function formatRate(rate: number | string): string {
  const n = typeof rate === "string" ? Number(rate) : rate;
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(n) ? n : 0);
}

export function isForeign(currency: string | null | undefined): boolean {
  return !!currency && currency.toUpperCase() !== BASE_CURRENCY;
}

/**
 * Rapor motorunun döndürdüğü ham hücreyi sütunun biçimine göre yazıya çevirir.
 *
 * `lib/format`ta duruyor, `report-preview`de değil: yazdırma yüzeyi bir sunucu
 * bileşeni ve tek bir yardımcı için `"use client"` bir modülden içe aktarım
 * yapıyordu. Fonksiyonun tarayıcıyla hiç işi yok.
 */
export function formatCell(
  value: string | number | boolean | null,
  format: string,
): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "money":
      return formatTRY(Number(value));
    case "percent":
      return `%${Number(value).toLocaleString("tr-TR")}`;
    case "number":
      return Number(value).toLocaleString("tr-TR");
    case "date":
      return new Date(String(value)).toLocaleDateString("tr-TR");
    case "datetime":
      return new Date(String(value)).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    default:
      return typeof value === "boolean"
        ? value
          ? "Evet"
          : "Hayır"
        : String(value);
  }
}

/** Sağa yaslanan, sekmeli rakamla yazılan sütun mu. */
export function isNumericFormat(format: string): boolean {
  return format === "money" || format === "number" || format === "percent";
}

const QUANTITY = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/**
 * Miktar: gereksiz sıfır yok, en fazla üç ondalık (12 · 1,5 · 0,75).
 *
 * Adet satan kurulumda çıktı eskisiyle aynı; kilo ve metre satan kalemde
 * "0.75" yerine "0,75" basılıyor.
 */
export function formatQuantity(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return QUANTITY.format(Number.isFinite(n) ? n : 0);
}
