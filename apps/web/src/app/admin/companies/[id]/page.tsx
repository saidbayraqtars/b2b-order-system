import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, getVolumeStatus } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { formatTRY } from "@/lib/format";
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

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <Link
        href="/admin/companies"
        className="inline-block text-sm text-neutral-500 hover:underline"
      >
        ← Firmalar
      </Link>

      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">
            {company.name}
            {!company.isActive && (
              <span className="ml-2 text-sm font-normal text-neutral-500">(pasif)</span>
            )}
          </h1>
          <p className="text-sm text-neutral-500">
            Bakiye {formatTRY(company.currentBalance)} / limit{" "}
            {formatTRY(company.creditLimit)} · vade {company.paymentTermDays} gün ·{" "}
            {company.counts.orders} sipariş
          </p>
          <p className="text-sm text-neutral-500">
            Hacim iskontosu:{" "}
            {volume.current ? (
              <strong>
                %{volume.current.percent} · {volume.current.name}
              </strong>
            ) : (
              "yok"
            )}
            {volume.mode === "MANUAL"
              ? " (elle atanmış)"
              : volume.turnover !== null
                ? ` · son ${volume.windowMonths} ay cirosu ${formatTRY(volume.turnover)}`
                : ""}
            {volume.next
              ? ` · ${volume.next.name} (%${volume.next.percent}) için ${formatTRY(volume.next.remaining)} kaldı`
              : ""}
          </p>
        </div>
        <Link
          href={`/admin/companies/${company.id}/statement`}
          className="text-sm text-indigo-600 hover:underline"
        >
          Cari ekstre →
        </Link>
      </header>

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
          requiresOrderApproval: company.requiresOrderApproval,
          isActive: company.isActive,
          customerGroupId: company.customerGroup?.id ?? "",
          salesRepId: company.salesRep?.id ?? "",
          allowedPaymentMethods: company.allowedPaymentMethods,
          paymentTermIds: company.paymentTerms.map((t) => t.id),
          volumeDiscountMode: company.volumeDiscountMode,
          volumeTierId: company.volumeTier?.id ?? "",
        }}
      />

      <CompanyAddresses companyId={company.id} addresses={company.addresses} />

      <UserManager
        currentUserId={user.id}
        fixedCompanyId={company.id}
        allowedRoles={["COMPANY_ADMIN", "COMPANY_STAFF"]}
        grantablePermissions={user.permissions}
      />

      <CompanyDiscounts companyId={company.id} />
    </main>
  );
}
