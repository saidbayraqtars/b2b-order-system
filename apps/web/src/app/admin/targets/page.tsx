import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { TargetManager } from "./_components/target-manager";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  await requirePage(["SUPER_ADMIN"], "targets.manage");

  const reps = await prisma.user.findMany({
    where: { role: "SALES_REP", isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader
        title="Temsilci hedefleri"
        subtitle="Günlük, haftalık, aylık ve yıllık ziyaret ve ciro hedefleri"
      />
      <TargetManager reps={reps} />
    </main>
  );
}
