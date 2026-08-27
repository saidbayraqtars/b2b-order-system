import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
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
      <Note>
        Tasarım bir <strong>satır listesi</strong>, tuval değil: termal yazıcı
        satır satır basıyor ve mutlak konum her cihazda başka yere düşüyor.{" "}
        <code className="tech-num">{"{{alan}}"}</code> işaretleri basım anında
        dolar; sağdaki listede o tür için gerçekten dolan alanlar yazıyor,
        dolmayanlar hiç görünmüyor. Her türün bir <strong>varsayılanı</strong>{" "}
        var ve basım ekranı başka bir tasarım istenmedikçe onu kullanır; hiç
        tasarım tanımlanmamışsa gömülü hazır tasarıma düşer — yani etiket basımı
        bu ekran hiç açılmasa da çalışır.
      </Note>
    </main>
  );
}
