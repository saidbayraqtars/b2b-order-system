import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { AgentsPanel } from "./_components/agents-panel";
import { SyncRunsPanel } from "./_components/sync-runs-panel";

export default async function AdminErpPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <div>
      <AdminNav email={user.email} current="/admin/erp" />
      <main className="mx-auto max-w-5xl space-y-5 px-4 pb-8">
        <h1 className="text-xl font-bold">ERP Bağlantısı</h1>
        <SyncRunsPanel />
        <AgentsPanel />
        <p className="text-sm text-neutral-500">
          Bu sistem müşterinin ERP&apos;sine <strong>uzanmaz</strong>. ERP&apos;nin
          bulunduğu makinede küçük bir <strong>ajan</strong> çalışır, ERP&apos;yi
          okur ve veriyi buraya gönderir; ERP şemasını bilen taraf ajandır. Ajan
          ERP&apos;ye <strong>hiçbir şey yazmaz</strong> — veritabanı kullanıcısına
          yalnızca okuma yetkisi verin. Eşitleme <strong>kayıt oluşturmaz</strong>:
          yalnızca cari/stok kodu eşleşenler güncellenir, eşleşmeyenler aşağıda
          kodlarıyla listelenir. ERP&apos;nin bildirdiği cari bakiyesi ayrı bir
          alanda durur, bizim kendi defterimizin bakiyesinin üzerine yazılmaz.
        </p>
      </main>
    </div>
  );
}
