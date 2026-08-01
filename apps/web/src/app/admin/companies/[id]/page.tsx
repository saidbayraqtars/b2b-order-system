import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@repo/database";
import { requirePage } from "@/lib/guard";
import { AdminNav } from "../../_components/admin-nav";
import { CompanyDiscounts } from "./_components/company-discounts";

export default async function AdminCompanyPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requirePage(["SUPER_ADMIN"]);

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      creditLimit: true,
      currentBalance: true,
      currency: true,
      customerGroup: { select: { name: true } },
      salesRep: { select: { name: true } },
    },
  });
  if (!company) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <AdminNav email={user.email} current="/admin" />
      <Link
        href="/admin"
        className="mb-3 inline-block text-sm text-neutral-500 hover:underline"
      >
        ← Panel
      </Link>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">{company.name}</h1>
        <Link
          href={`/admin/companies/${company.id}/statement`}
          className="text-sm text-indigo-600 hover:underline"
        >
          Cari ekstre →
        </Link>
      </div>
      <p className="mb-6 text-sm text-neutral-500">
        Grup: {company.customerGroup?.name ?? "—"} · Plasiyer:{" "}
        {company.salesRep?.name ?? "—"} · Bakiye{" "}
        {company.currentBalance.toFixed(2)} / limit{" "}
        {company.creditLimit.toFixed(2)} {company.currency}
      </p>

      <CompanyDiscounts companyId={company.id} />
    </main>
  );
}
