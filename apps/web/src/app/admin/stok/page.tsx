import { requirePage } from "@/lib/guard";
import { MovementsPanel } from "./_components/movements-panel";
import { StockLevelsPanel } from "./_components/stock-levels-panel";
import { StockSummaryPanel } from "./_components/stock-summary-panel";
import { WarehousesPanel } from "./_components/warehouses-panel";

export default async function AdminStokPage() {
  await requirePage(["SUPER_ADMIN"], "stock.view");

  return (
    <div>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <h1 className="text-xl font-bold">Stok defteri</h1>
        <StockSummaryPanel />
        <StockLevelsPanel />
        <MovementsPanel />
        <WarehousesPanel />
        <p className="text-sm text-neutral-500">
          Eldeki adet artık <strong>bu defterin bakiyesi</strong>: her hareket onu
          farkı kadar oynatır, kimse üstüne yazmaz. Sipariş girildiği anda malı
          düşer — sevkte değil — yoksa aynı son kutu iki müşteriye satılırdı; iptal
          ve ret geri verir. <strong>ERP senkronu</strong> ezmez, farkı kadar
          hareket yazar, bu yüzden &ldquo;gece stok neden düştü&rdquo; sorusunun
          cevabı defterde durur. Kayıtlar silinmez: yanlış bir kayıt, kendisine
          bağlı ters kayıtla iptal edilir. Sipariş kaynaklı satırların iptali ise
          siparişin kendisinden yapılır.
        </p>
      </main>
    </div>
  );
}
