import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { ActivityClient } from "./_components/activity-client";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <AdminNav email={user.email} current="/admin/activity" />
      <div className="mb-4">
        <h1 className="text-xl font-bold">Hareket Akışı</h1>
        <p className="text-sm text-neutral-500">
          Sipariş geçmişi, cari hareketler ve sistem kayıtları tek akışta.
          Buradan bir şey değişmez — üç kaynağın da kendi kaydı esastır.
        </p>
      </div>
      <ActivityClient />
    </main>
  );
}
