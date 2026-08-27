import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { AccountsPanel } from "./_components/accounts-panel";
import { CardPaymentsPanel } from "./_components/card-payments-panel";
import { CashSummaryPanel } from "./_components/cash-summary-panel";
import { MovementsPanel } from "./_components/movements-panel";

export default async function AdminKasaPage() {
  await requirePage(["SUPER_ADMIN"], "cash.view");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Kasa & banka"
        subtitle="Bugün kasaya ne girdi, hangi hesapta ne var"
      />
      {/* Uzun olan en altta: kasa hareketleri yüz satır çizebiliyor ve
          hesap tanımları onun altında kalırsa hiç görülmüyor. */}
      <div className="space-y-5">
        <CashSummaryPanel />
        <CardPaymentsPanel />
        <AccountsPanel />
        <MovementsPanel />
      </div>
      <Note>
        Bu defter <strong>bizim paramızı</strong> takip eder; müşterinin borcu
        cari ekstrede durur. Nakit ve havale sipariş onaylandığında bedeli
        buraya girer, çünkü cariye hiç yazılmaz. <strong>Kart</strong>{" "}
        farklıdır: para çekilene kadar bizim değildir, bu yüzden sipariş
        yalnızca bir tahsilat kaydı açar; kasaya girişi tahsilat onaylanınca
        olur. <strong>Çek ve senet</strong> ise hiç girmez — müşterinin borcunu
        kapatır ama tahsil edilene kadar harcanabilir para değildir. Kayıtlar
        silinmez: yanlış bir kayıt, kendisine bağlı ters kayıtla iptal edilir.
      </Note>
    </div>
  );
}
