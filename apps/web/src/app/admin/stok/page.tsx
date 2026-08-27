import { requirePage } from "@/lib/guard";
import { StockWorkbench } from "./_components/stock-workbench";

// Tezgâh sekmesini `?bolum=` ile okuyor; `useSearchParams` bir istemci
// bileşeninde ancak sayfa isteğe göre çizildiğinde Suspense sınırı istemiyor.
export const dynamic = "force-dynamic";

export default async function AdminStokPage() {
  await requirePage(["SUPER_ADMIN"], "stock.view");

  // Dipnot burada değil sekmenin içinde: defterin kuralları dört ayrı konu ve
  // hepsini sayfanın altına yığmak, açık sekmeyle ilgisi olmayan üç paragrafı
  // her seferinde okutuyordu. Depolar sekmesinde iki dipnot alt alta düşünce
  // ekran görüntüsünde görüldü.
  return (
    <main className="mx-auto max-w-5xl">
      <StockWorkbench />
    </main>
  );
}
