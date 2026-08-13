import { formatMoney, formatRate, isForeign } from "@/lib/format";

// Dövizle listelenen bir satırın künyesi.
//
// Tahsil edilen tutar her zaman TL — defter TL, kur siparişte donuyor. Bu not
// onun yerini almıyor, altına giriyor: müşteri dolarla anlaştıysa hangi sayıdan
// çevrildiğini görmek istiyor, ve fatura kontrol eden kişi çarpımı kendi
// yapabilmeli.
//
// Sunucu bileşeni olarak da çalışıyor (fatura ve irsaliye sayfaları sunucuda
// basılıyor): durum yok, kanca yok.

export function CurrencyNote({
  currency,
  amount,
  rate,
  prefix,
  className,
}: {
  /** Satırın listelendiği para birimi. "TRY" ise hiçbir şey basılmaz. */
  currency: string | null | undefined;
  /** O para birimindeki birim fiyat. */
  amount: string | null | undefined;
  /**
   * Siparişte donan kur. Verilmezse yalnız tutar basılır — vitrinde kur
   * gösterilmesi gereksiz gürültü, faturada ise zorunlu.
   */
  rate?: string | null;
  /**
   * Notun önüne yazılacak etiket ("birim" gibi). Not basılmadığında etiket de
   * basılmıyor — bileşenin dışında yazılsa TL satırlarda öksüz kalırdı.
   */
  prefix?: string;
  className?: string;
}) {
  // Üçünden biri eksikse not basmak yarım bilgi verir: "USD" yazıp sayıyı
  // göstermemek, TL fiyatın dolar olduğu izlenimini bırakıyor.
  if (!isForeign(currency) || !amount) return null;

  const money = formatMoney(amount, currency!);
  const body = rate ? `${money} × ${formatRate(rate)}` : money;
  return (
    <span className={className ?? "text-neutral-500"}>
      {prefix ? `${prefix} ${body}` : body}
    </span>
  );
}
