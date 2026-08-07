import { requirePage } from "@/lib/guard";
import { AnnouncementsManager } from "./_components/announcements-manager";

export default async function AdminAnnouncementsPage() {
  await requirePage(["SUPER_ADMIN"], "announcements.manage");

  return (
    <div>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-5 text-xl font-bold">Vitrin Duyuruları</h1>
        <AnnouncementsManager />
        <p className="mt-4 text-sm text-neutral-500">
          Duyurular yalnızca <strong>gösterimdir</strong> — hiçbir tutarı
          değiştirmezler. İndirimin kendisi Kampanyalar ekranında tanımlanır;
          buradaki kayıt onu müşteriye duyurur.
        </p>
      </main>
    </div>
  );
}
