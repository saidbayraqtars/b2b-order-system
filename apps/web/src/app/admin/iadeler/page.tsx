import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { ReturnBoard } from "./_components/return-board";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  await requirePage(["SUPER_ADMIN", "SALES_REP"], "returns.manage");

  return (
    <main className="mx-auto max-w-7xl">
      <PageHeader
        title="İadeler"
        subtitle="Talepleri karara bağla, geleni teslim al"
      />
      <ReturnBoard />
    </main>
  );
}
