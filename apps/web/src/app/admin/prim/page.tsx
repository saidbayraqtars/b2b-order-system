import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { CommissionBoard } from "./_components/commission-board";

export const dynamic = "force-dynamic";

export default async function AdminCommissionPage() {
  await requirePage(["SUPER_ADMIN"], "commission.manage");

  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Plasiyer primi"
        subtitle="Prim planları ve dönem hakedişi"
      />
      <CommissionBoard />
      <Note>
        Prim <strong>iki tabandan</strong> hesaplanır ve ikisi ayrı plan olarak
        tanımlanır: <strong>ciro</strong> (net mal bedeli, KDV ve navlun hariç —
        hacim iskontosuyla aynı tanım) ve <strong>tahsilat</strong> (defterin
        alacak satırları). Satıp tahsil edemeyen plasiyer kâr getirmediği için
        sektörde ikincisi yaygındır. Bir plasiyere iki plan birden atanabilir;
        hakediş ikisinin toplamıdır.
        <br />
        <br />
        <strong>Atıf portföye göredir</strong>, kaydı kimin girdiğine göre
        değil: ofisten girilen bir tahsilat da o carinin plasiyerinin primini
        doğurur. Hedef çarpanı yalnızca o dönem için tanımlı bir{" "}
        <strong>ciro hedefi</strong> varsa ve tutturulduysa uygulanır — hedefi
        olmayan herkese çarpan vermek, çarpanı ikinci bir orana çevirirdi.
        Hakediş saklanmıyor, her okumada yeniden hesaplanıyor.
      </Note>
    </main>
  );
}
