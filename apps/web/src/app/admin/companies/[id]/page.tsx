import { notFound } from "next/navigation";
import { getCompany, getVolumeStatus } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { formatTRY } from "@/lib/format";
import { Badge, PageHeader, StatTile } from "@/components/ui";
import { LinkButton } from "@/components/form";
import type { CustomCodeForm } from "@/components/custom-codes";
import { CompanyForm } from "../_components/company-form";
import { CompanyAddresses } from "./_components/company-addresses";
import { CompanyDiscounts } from "./_components/company-discounts";
import { UserManager } from "@/components/user-manager";

export default async function AdminCompanyPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage(["SUPER_ADMIN"], "companies.view");

  const company = await getCompany(params.id).catch(() => null);
  if (!company) notFound();

  // Read live rather than from the company row: under AUTO the rung in force is
  // whatever turnover earns right now, and a form field cannot show that.
  const volume = await getVolumeStatus(company.id);

  // Hacim satırı üç ayrı cümleden kuruluyordu ve hepsi tek paragrafta üst üste
  // biniyordu. Kutunun altına tek bir açıklama satırı düşüyor: hangi basamak,
  // neden o basamak, bir sonrakine ne kaldı.
  const volumeHint = volume.current
    ? `%${volume.current.percent} · ${volume.current.name}`
    : "yok";
  const volumeWhy =
    volume.mode === "MANUAL"
      ? "elle atanmış"
      : volume.turnover !== null
        ? `son ${volume.windowMonths} ay cirosu ${formatTRY(volume.turnover)}`
        : null;
  const volumeNext = volume.next
    ? `${volume.next.name} (%${volume.next.percent}) için ${formatTRY(volume.next.remaining)} kaldı`
    : null;

  const available = Number(company.availableCredit);

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={company.name}
        back={{ href: "/admin/companies", label: "Firmalar" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {!company.isActive && <Badge>Pasif</Badge>}
            <span>{company.counts.orders} sipariş</span>
            <span aria-hidden>·</span>
            <span>{company.counts.users} kullanıcı</span>
            <span aria-hidden>·</span>
            <span>vade {company.paymentTermDays} gün</span>
            {company.salesRep && (
              <>
                <span aria-hidden>·</span>
                <span>plasiyer {company.salesRep.name}</span>
              </>
            )}
          </span>
        }
        actions={
          <LinkButton
            href={`/admin/companies/${company.id}/statement`}
            size="md"
          >
            Cari ekstre
          </LinkButton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Bakiye" value={formatTRY(company.currentBalance)} />
        <StatTile label="Kredi limiti" value={formatTRY(company.creditLimit)} />
        <StatTile
          label="Kullanılabilir"
          value={formatTRY(company.availableCredit)}
          tone={available < 0 ? "critical" : "positive"}
          hint={available < 0 ? "limit aşıldı" : "limit içinde"}
        />
        <StatTile
          label="Hacim iskontosu"
          value={volumeHint}
          hint={
            [volumeWhy, volumeNext].filter(Boolean).join(" · ") || undefined
          }
        />
      </div>

      <CompanyForm
        company={{
          id: company.id,
          name: company.name,
          taxNumber: company.taxNumber ?? "",
          taxOffice: company.taxOffice ?? "",
          email: company.email ?? "",
          phone: company.phone ?? "",
          creditLimit: company.creditLimit,
          paymentTermDays: String(company.paymentTermDays),
          minOrderAmount: company.minOrderAmount ?? "",
          requiresOrderApproval: company.requiresOrderApproval,
          isActive: company.isActive,
          customerGroupId: company.customerGroup?.id ?? "",
          salesRepId: company.salesRep?.id ?? "",
          allowedPaymentMethods: company.allowedPaymentMethods,
          paymentTermIds: company.paymentTerms.map((t) => t.id),
          volumeDiscountMode: company.volumeDiscountMode,
          volumeTierId: company.volumeTier?.id ?? "",
          warehouseId: company.warehouse?.id ?? "",
          // Sunucu bileşeni: istemci modülündeki yardımcı burada çağrılamıyor,
          // dönüşüm satır içinde.
          codes: Object.fromEntries(
            Object.entries(company.codes).map(([k, val]) => [k, val ?? ""]),
          ) as CustomCodeForm,
        }}
      />

      <CompanyAddresses companyId={company.id} addresses={company.addresses} />

      <UserManager
        collapsible
        currentUserId={user.id}
        fixedCompanyId={company.id}
        allowedRoles={["COMPANY_ADMIN", "COMPANY_STAFF"]}
        grantablePermissions={user.permissions}
      />

      <CompanyDiscounts companyId={company.id} />
    </main>
  );
}
