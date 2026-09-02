import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { ChequeBoard } from "./_components/cheque-board";

export const dynamic = "force-dynamic";

export default async function ChequesPage() {
  await requirePage(["SUPER_ADMIN"], "cheques.manage");

  // Tahsil adımında paranın gireceği hesap sorulacak; liste sunucudan geliyor
  // ki ekran kapalı bir hesabı seçenek olarak göstermesin.
  const accounts = await prisma.cashAccount.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true },
  });

  return (
    <main className="mx-auto max-w-7xl">
      <PageHeader
        title="Çek & senet portföyü"
        subtitle="Vade takibi, tahsile verme, karşılıksız ve ciro"
      />
      <ChequeBoard accounts={accounts} />
      <Note collapsible defaultOpen={false}>
        Çek kasaya <strong>tahsil edilince</strong> girer, alındığında değil:
        elimizdeki kâğıt henüz harcanabilir para değil. Karşılıksız ve müşteriye
        iade, kapattığı borcu <strong>cariye geri yazar</strong> — tahsilat
        kaydı silinmez, ekstrede iki satır da görünür.
      </Note>
    </main>
  );
}
