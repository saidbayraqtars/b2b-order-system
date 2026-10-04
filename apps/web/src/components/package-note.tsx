import { formatQuantity, formatTRY } from "@/lib/format";

// Paketle sipariş edilmiş satırın künyesi: "= 2 KOLİ" ve "KOLİ 100,00 ₺".
//
// Miktar ve birim fiyat belgede her zaman taban birimde (24 adet, 8,33 ₺)
// basılır; bu not altına paket karşılığını yazar. Kısmi sevkte paket sayısı
// kesirli çıkabilir (24 adetin 6'sı); o zaman not hiç basılmaz — "0,5 koli"
// kâğıtta kimsenin işine yaramaz.
//
// Sunucu bileşeni olarak da çalışıyor: durum yok, kanca yok.

export interface PackageUnit {
  name: string;
  factor: number;
  count: number;
  unitPrice?: string | null;
}

/** Miktar hücresinin altı: "= 2 KOLİ". */
export function PackageCount({
  unit,
  className,
}: {
  unit: PackageUnit | null | undefined;
  className?: string;
}) {
  if (!unit || !Number.isInteger(Math.round(unit.count * 1000) / 1000)) return null;
  return (
    <span className={className}>
      = {formatQuantity(unit.count)} {unit.name}
    </span>
  );
}

/** Birim fiyat hücresinin altı: "KOLİ 100,00 ₺". */
export function PackagePrice({
  unit,
  className,
}: {
  unit: PackageUnit | null | undefined;
  className?: string;
}) {
  if (!unit?.unitPrice) return null;
  return (
    <span className={className}>
      {unit.name} {formatTRY(unit.unitPrice)}
    </span>
  );
}
