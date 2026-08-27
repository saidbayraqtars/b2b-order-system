import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
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
      <Note>
        Talep karara bağlanır, stok ve cari yalnızca{" "}
        <strong>teslim alırken</strong> oynar: kabul edilmiş ama gelmemiş mal ne
        depoda vardır ne de alacak doğurur. Yazılan şey gelen maldır — üç koli
        istenip ikisi geldiyse iki yazılır; hasarlı işaretlenen satır stoka
        girmez ama bedeli yine alacak yazılır.
      </Note>
    </main>
  );
}
