import { requirePage } from "@/lib/guard";
import { BulkImportClient } from "./_components/bulk-import-client";

export const dynamic = "force-dynamic";

/**
 * Excel ile toplu fiyat ve stok güncelleme.
 *
 * Yeni müşteri devreye almanın önündeki en somut engel buydu: kurulum sihirbazı
 * "2673 varyant, 10669 fiyat satırı" diyor ve hiçbir gerçek müşteri o kadar
 * satırı ekrandan tek tek giremez. Toptancıda zam da ayda bir, toplu gelir.
 *
 * Kapı `pricing.manage`; stok sekmesi ayrıca `stock.manage` istiyor ve o kontrol
 * uçta (sayım defteri oynatıyor, fiyat oynatmıyor).
 */
export default async function BulkImportPage() {
  await requirePage(["SUPER_ADMIN"], "pricing.manage");

  return (
    <main className="mx-auto max-w-6xl">
      <BulkImportClient />
    </main>
  );
}
