import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { SeriesManager } from "./_components/series-manager";

export default async function AdminDocumentsPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <AdminNav email={user.email} current="/admin/documents" />
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
