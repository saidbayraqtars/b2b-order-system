import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { SeriesManager } from "./_components/series-manager";

export default async function AdminDocumentsPage() {
  await requirePage(["SUPER_ADMIN"], "documents.view");

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Belge serileri"
        subtitle="İrsaliye ve fatura numaraları hangi seriden veriliyor"
      />
      <SeriesManager />
      <Note>
        Numara, belgeyi oluşturan işlemin içinde{" "}
        <strong>tek bir artırma</strong> ile alınır — aynı anda iki sevkiyat
        yapılsa da aynı numarayı alamazlar. İptal edilen belge numarasını geri
        vermez. Numarayı ERP veriyorsa (VegaWin A5 gibi) seriyi{" "}
        <strong>ERP</strong> olarak işaretleyin: sistem numara üretmez, belge
        oluşturulurken numaranın girilmesini bekler.
      </Note>
    </main>
  );
}
