import { requirePage } from "@/lib/guard";
import { AnalyticsBoard } from "./_components/analytics-board";

// Sekme `?bolum=` ile adreste; `useSearchParams` istemci bileşeninde ancak
// sayfa isteğe göre çizildiğinde Suspense sınırı istemiyor (bkz. /admin/stok).
export const dynamic = "force-dynamic";

/**
 * Yönetici panosu.
 *
 * Rapor tasarımcısının yerine geçmiyor: o **kullanıcı tanımlı** ve tanımı
 * veride duruyor; bu **küratörlü** ve kodda. Büyüme matematiği bir sütun
 * listesi değil — kohort matrisi, regresyon eğimi ve ciro köprüsü kullanıcının
 * kuracağı şeyler değil, ve ikisini tek motora sıkıştırmak ikisini de bozardı.
 *
 * İzin `analytics.view`, rol değil (Adım 30 kuralı): maliyet ve marj bu
 * ekranda ve `costPrice` müşteriye gösterilmiyor, plasiyere de
 * gösterilmemeli.
 */
export default async function AnalyticsPage() {
  await requirePage(["SUPER_ADMIN"], "analytics.view");

  return (
    <main className="mx-auto max-w-6xl">
      <AnalyticsBoard />
    </main>
  );
}
