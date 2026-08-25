import { requirePage } from "@/lib/guard";
import { AgentsPanel } from "./_components/agents-panel";
import { CommandPanel } from "./_components/command-panel";
import { SyncRunsPanel } from "./_components/sync-runs-panel";

export default async function AdminErpPage() {
  await requirePage(["SUPER_ADMIN"], "erp.manage");

  return (
    <div>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <h1 className="text-xl font-bold">ERP Bağlantısı</h1>
        <SyncRunsPanel />
        <AgentsPanel />
        <CommandPanel />
        <p className="text-sm text-neutral-500">
          Bu sistem müşterinin ERP&apos;sine <strong>uzanmaz</strong>. ERP&apos;nin
          bulunduğu makinede küçük bir <strong>ajan</strong> çalışır, ERP&apos;yi
          okur ve veriyi buraya gönderir; ERP şemasını bilen taraf ajandır.
          Eşitleme yönü ERP&apos;ye <strong>hiçbir şey yazmaz</strong> — veritabanı
          kullanıcısına yalnızca okuma yetkisi verin. Eşitleme
          <strong> kayıt oluşturmaz</strong>:
          yalnızca cari/stok kodu eşleşenler güncellenir, eşleşmeyenler aşağıda
          kodlarıyla listelenir. ERP&apos;nin bildirdiği cari bakiyesi ayrı bir
          alanda durur, bizim kendi defterimizin bakiyesinin üzerine yazılmaz.
        </p>
        <p className="text-sm text-neutral-500">
          <strong>Sipariş aktarımı ayrı ve varsayılan olarak kapalıdır.</strong>{" "}
          Aktarım siparişin kendi ekranından, <em>ERP&apos;ye aktar</em> düğmesiyle
          yapılır; kendiliğinden giden bir şey yoktur. Üç kilit birden açık olmalı:
          ajandaki yazma bayrağı, ERP veritabanı kullanıcısının yazma yetkisi ve
          burada <em>erp.push</em> yetkisi olan bir kişinin onayı. Belge, ERP&apos;ye
          <strong> alınan sipariş</strong> olarak yazılır — yasal belge değildir;
          faturaya çevirme ve e-fatura gönderimi müşterinin kendi ERP&apos;sinde kalır.
          Aktarım denemeleri yukarıdaki listede <em>Sipariş aktarımı</em> olarak görünür.
        </p>
      </main>
    </div>
  );
}
