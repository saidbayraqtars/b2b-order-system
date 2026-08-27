import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { TermsManager } from "./_components/terms-manager";

export default async function AdminPaymentTermsPage() {
  await requirePage(["SUPER_ADMIN"], "payment_terms.manage");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Vade tanımları"
        subtitle="Siparişin kaç gün sonra ödeneceğini söyleyen tanımlar"
      />
      <TermsManager />
      <Note>
        Tanım burada yapılır, <strong>kime sunulacağı</strong> firma sayfasında
        seçilir. Sipariş vadeyi gün olarak kopyalar: bir tanımı sonradan
        değiştirmek geçmiş siparişlerin vadesini bozmaz.
      </Note>
    </div>
  );
}
