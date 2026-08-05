import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { AnnouncementsManager } from "./_components/announcements-manager";

export default async function AdminAnnouncementsPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <div>
      <AdminNav email={user.email} current="/admin/announcements" />
      <main className="mx-auto max-w-4xl px-4 pb-8">
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
