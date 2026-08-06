import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { TermsManager } from "./_components/terms-manager";

export default async function AdminPaymentTermsPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  return (
    <div>
      <AdminNav email={user.email} current="/admin/payment-terms" />
      <main className="mx-auto max-w-4xl px-4 pb-6">
        <h1 className="mb-5 text-xl font-bold">Vade Tanımları</h1>
        <TermsManager />
        <p className="mt-4 text-sm text-neutral-500">
          Tanım burada yapılır, <strong>kime sunulacağı</strong> firma sayfasında
          seçilir. Sipariş vadeyi gün olarak kopyalar: bir tanımı sonradan
          değiştirmek geçmiş siparişlerin vadesini bozmaz.
        </p>
      </main>
    </div>
  );
}
