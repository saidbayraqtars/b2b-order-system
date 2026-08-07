import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
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
    <main className="mx-auto max-w-7xl px-4 py-6">
      <PageHeader
        title="Çek & senet portföyü"
        subtitle="Vade takibi, tahsile verme, karşılıksız ve ciro"
      />
      <ChequeBoard accounts={accounts} />
    </main>
  );
}
