import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { ReconciliationBoard } from "./_components/reconciliation-board";

export const dynamic = "force-dynamic";

export default async function AdminReconciliationPage() {
  await requirePage(["SUPER_ADMIN"], "reconciliation.manage");

  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Cari mutabakat"
        subtitle="Dönem sonu mektubu ve müşterinin cevabı"
      />
      <ReconciliationBoard />
      <Note collapsible defaultOpen={false}>
        Mektuptaki bakiye bir <strong>anlık görüntü</strong>: dönem sonunda
        defterden hesaplanıp satıra donuyor. Bugünkü bakiye ondan farklı
        olabilir ve bu doğaldır — defter işlemeye devam ediyor. İkisi yan yana
        duruyor ki mektubun ne kadar eski olduğu görünsün.
        <br />
        <br />
        <strong>Cevap defteri oynatmaz.</strong> &ldquo;Mutabıkım&rdquo; bir
        beyandır, bir işlem değil; itiraz da bir düzeltme değil, bir konuşmanın
        başlangıcıdır. Düzeltme gerekiyorsa onu siz yaparsınız ve defterde kendi
        satırını açar. Cevaplanmış bir mektup geri çekilemez: müşterinin
        beyanını satıcının silmesi, mutabakatın taşıdığı tek şeyi yok ederdi.
      </Note>
    </main>
  );
}
