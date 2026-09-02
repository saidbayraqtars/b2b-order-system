import { requirePage } from "@/lib/guard";
import { Note, PageHeader } from "@/components/ui";
import { OrderPolicyForm } from "./_components/order-policy-form";

export default async function AdminOrderPolicyPage() {
  await requirePage(["SUPER_ADMIN"], "order_policy.manage");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Sipariş kuralları"
        subtitle="Asgari sipariş büyüklüğü ve sevkiyat kesim saati"
      />
      <OrderPolicyForm />
      <Note collapsible defaultOpen={false}>
        Asgari <strong>alıcıyı</strong> bağlar: plasiyer ve yönetici eşiğin
        altında sipariş geçebilir, çünkü pazarlık onların işi. Tek bir cariyi
        muaf tutmak ya da ona ayrı bir eşik koymak için firma sayfasındaki{" "}
        <strong>asgari sipariş tutarı</strong> alanını kullanın — orası boşken
        buradaki genel kural geçerlidir.
        <br />
        <br />
        Kesim saati <strong>engel değil</strong>: 16:00&apos;dan sonra gelen
        sipariş reddedilmez, sepette yalnızca hangi gün çıkacağı yazar. Pazar
        her hâlükârda kapalıdır.
      </Note>
    </div>
  );
}
