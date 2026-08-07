import { requirePage } from "@/lib/guard";
import { SeriesManager } from "./_components/series-manager";

export default async function AdminDocumentsPage() {
  await requirePage(["SUPER_ADMIN"], "documents.view");

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-5 text-xl font-bold">Belge Serileri</h1>
      <SeriesManager />
      <p className="mt-4 text-sm text-neutral-500">
        İrsaliye ve fatura numaraları buradaki serilerden verilir. Numara,
        belgeyi oluşturan işlemin içinde tek bir artırma ile alınır — aynı anda
        iki sevkiyat yapılsa da aynı numarayı alamazlar. İptal edilen belge
        numarasını geri vermez.
      </p>
      <p className="mt-2 text-sm text-neutral-500">
        Numarayı ERP veriyorsa (VegaWin A5 gibi) seriyi{" "}
        <strong>ERP</strong> olarak işaretleyin: sistem numara üretmez, belge
        oluşturulurken numaranın girilmesini bekler.
      </p>
    </main>
  );
}
