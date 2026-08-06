import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { AccountsPanel } from "./_components/accounts-panel";
import { CashSummaryPanel } from "./_components/cash-summary-panel";
import { MovementsPanel } from "./_components/movements-panel";

export default async function AdminKasaPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <div>
      <AdminNav email={user.email} current="/admin/kasa" />
      <main className="mx-auto max-w-5xl space-y-5 px-4 pb-8">
        <h1 className="text-xl font-bold">Kasa & Banka</h1>
        <CashSummaryPanel />
        <MovementsPanel />
        <AccountsPanel />
        <p className="text-sm text-neutral-500">
          Bu defter <strong>bizim paramızı</strong> takip eder; müşterinin borcu
          cari ekstrede durur. Peşin (nakit / havale / kart) bir sipariş onaylandığında
          bedeli buraya girer, çünkü cariye hiç yazılmaz. <strong>Çek ve senet</strong>{" "}
          kasaya girmez: müşterinin borcunu kapatır ama tahsil edilene kadar
          harcanabilir para değildir. Kayıtlar silinmez — yanlış bir kayıt, kendisine
          bağlı ters kayıtla iptal edilir.
        </p>
      </main>
    </div>
  );
}
