import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { DeliveryBoard } from "@/components/delivery-board";

export const dynamic = "force-dynamic";

export default async function AdminDeliveriesPage() {
  await requirePage(["SUPER_ADMIN"], "orders.fulfil");

  return (
    <main className="mx-auto max-w-5xl">
      <PageHeader
        title="Dağıtım"
        subtitle="Sevkiyatlara kurye ata, teslim durumunu izle"
      />
      <DeliveryBoard canDispatch />
      <Note>
        Listeye giren şey <strong>sevkiyat</strong>, sipariş değil: irsaliyesi
        kesilmemiş bir sipariş burada görünmez. Kurye ataması teslimden önce
        serbestçe değişir — seçimi boşaltmak sevkiyatı atanmamışa döndürür — ama
        teslim edilmiş sevkiyatın kuryesi artık değiştirilemez.{" "}
        <strong>Teslim kaydı bir kez yazılır</strong>: kim teslim aldı bilgisi
        imzanın yerini tutuyor, üstüne yazılabilseydi hiçbir şeyin yerini
        tutmazdı. Atamayı kurye kendisi yapamaz; taşıyan ile kaydı tutan aynı
        kişi olmamalı. Siparişin bütün sevkiyatları teslim edilince sipariş
        kendiliğinden &ldquo;Teslim edildi&rdquo;ye geçer — kısmi teslimde
        durumu değişmez.
      </Note>
    </main>
  );
}
