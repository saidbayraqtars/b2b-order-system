import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { ActivityClient } from "./_components/activity-client";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requirePage(["SUPER_ADMIN"], "activity.view");

  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Hareket akışı"
        subtitle="Sipariş geçmişi, cari hareketler ve sistem kayıtları tek akışta"
      />
      <ActivityClient />
      <Note>
        Buradan bir şey değişmez — üç kaynağın da kendi kaydı esastır ve bu
        ekran onları yalnızca zaman sırasına dizer. Bir satırın ayrıntısı için
        kaynağına gidin: sipariş numarası siparişe, cari hareketi ekstreye,
        sistem kaydı güvenlik defterine bağlı.
      </Note>
    </main>
  );
}
