import { requirePage } from "@/lib/guard";
import { AccountsPanel } from "./_components/accounts-panel";
import { CardPaymentsPanel } from "./_components/card-payments-panel";
import { CashSummaryPanel } from "./_components/cash-summary-panel";
import { MovementsPanel } from "./_components/movements-panel";

export default async function AdminKasaPage() {
  await requirePage(["SUPER_ADMIN"], "cash.view");

  return (
    <div>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <h1 className="text-xl font-bold">Kasa & Banka</h1>
        <CashSummaryPanel />
        <CardPaymentsPanel />
        <MovementsPanel />
        <AccountsPanel />
        <p className="text-sm text-neutral-500">
          Bu defter <strong>bizim paramızı</strong> takip eder; müşterinin borcu
          cari ekstrede durur. Nakit ve havale sipariş onaylandığında bedeli buraya
          girer, çünkü cariye hiç yazılmaz. <strong>Kart</strong> farklıdır: para
          çekilene kadar bizim değildir, bu yüzden sipariş yalnızca bir tahsilat
          kaydı açar; kasaya girişi tahsilat onaylanınca olur.{" "}
          <strong>Çek ve senet</strong> ise hiç girmez — müşterinin borcunu kapatır
          ama tahsil edilene kadar harcanabilir para değildir. Kayıtlar silinmez:
          yanlış bir kayıt, kendisine bağlı ters kayıtla iptal edilir.
        </p>
      </main>
    </div>
  );
}
