import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { LabelDesigner } from "./_components/label-designer";

export const dynamic = "force-dynamic";

export default async function LabelsAdminPage() {
  await requirePage(["SUPER_ADMIN"], "labels.manage");

  return (
    <main className="mx-auto max-w-6xl">
      <PageHeader
        title="Etiket & fiş tasarımları"
        subtitle="Kargo etiketi ve 80 mm fişler — satır satır düzenlenir, aynı düzen kâğıda basılır"
      />
      <LabelDesigner />
    </main>
  );
}
