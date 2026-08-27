import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { AnnouncementsManager } from "./_components/announcements-manager";

export default async function AdminAnnouncementsPage() {
  await requirePage(["SUPER_ADMIN"], "announcements.manage");

  return (
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Vitrin duyuruları"
        subtitle="Bayinin vitrinde göreceği bant, şerit ve pencereler"
      />
      <AnnouncementsManager />
      <Note>
        Duyurular yalnızca <strong>gösterimdir</strong> — hiçbir tutarı
        değiştirmezler. İndirimin kendisi Kampanyalar ekranında tanımlanır;
        buradaki kayıt onu müşteriye duyurur.
      </Note>
    </main>
  );
}
