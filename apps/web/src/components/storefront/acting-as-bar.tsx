import { AlertTriangle } from "lucide-react";
import { formatTRY } from "@/lib/format";

/**
 * "X firması adına sipariş giriyorsunuz."
 *
 * Plasiyer ve süper admin için her sayfada, katalogun üstünde, bilerek dikkat
 * çeken bir renkte durur. Sebebi tasarım değil operasyon: yanlış cariye girilmiş
 * bir sipariş sonradan stok, cari ve fatura üçünü birden geri almayı gerektirir.
 * Hangi firma adına çalışıldığı asla tahmin edilmemeli.
 *
 * Kullanılabilir limit de burada: plasiyer siparişi tamamlamadan önce firmanın
 * limitinin dolu olduğunu görsün, sipariş onaya düştükten sonra değil.
 */
export function ActingAsBar({
  companyName,
  availableCredit,
}: {
  companyName: string;
  availableCredit: string | null;
}) {
  const available = availableCredit === null ? null : Number(availableCredit);
  const over = available !== null && available < 0;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-caution/40 bg-caution/10 px-4 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-caution" />
      <span className="text-label uppercase text-caution">
        {companyName} adına sipariş giriyorsunuz
      </span>
      {available !== null && (
        <span
          className={
            over
              ? "text-xs font-bold tabular-nums text-critical"
              : "text-xs tabular-nums text-caution"
          }
        >
          kullanılabilir limit {formatTRY(availableCredit!)}
          {over ? " — limit aşıldı, sipariş onaya düşer" : ""}
        </span>
      )}
    </div>
  );
}
