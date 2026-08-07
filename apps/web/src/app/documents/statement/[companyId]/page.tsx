import { redirect } from "next/navigation";
import { getCompanyAging, getStatement } from "@repo/services";
import { formatTRY } from "@/lib/format";
import { AuthError, InputError, requirePage } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";
import {
  DocumentField,
  DocumentParty,
  DocumentShell,
} from "../../_components/document-shell";

/**
 * Cari ekstrenin yazdırılabilir hâli — "PDF olarak dışarı aktar" bunun üzerinden
 * yapılır.
 *
 * Neden sunucuda PDF üretmiyoruz: tarayıcının "Yazdır → PDF olarak kaydet"
 * yolu zaten her makinede var, Türkçe karakterleri ve sayfa kırılımını doğru
 * yapıyor, ve ekstrenin biçimi belgenin kendisiyle **aynı** kalıyor. Sunucu
 * tarafı bir PDF kütüphanesi eklemek ikinci bir düzen (ve ikinci bir font
 * derdi) demek olurdu; ekstre değiştiğinde iki yerde birden değişmesi gerekirdi.
 *
 * Erişim kararı `resolveCompanyId`'ye ait: alıcı yalnızca kendi firmasını,
 * plasiyer yalnızca portföyünü, süper admin hepsini görür.
 */

const ALL_ROLES = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
] as const;

const BUCKET_LABELS = [
  ["current", "Vadesi gelmemiş"],
  ["d1_30", "1-30 gün"],
  ["d31_60", "31-60 gün"],
  ["d61_90", "61-90 gün"],
  ["d90_plus", "90+ gün"],
] as const;

export const dynamic = "force-dynamic";

function trDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR");
}

function trDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function StatementDocumentPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { from?: string; to?: string };
}) {
  const user = await requirePage(ALL_ROLES, "companies.view");

  // Sayfaların `withAuthErrors` sarmalayıcısı yok; yakalamazsak kullanıcı 403
  // yerine çökme sayfası görür (bkz. portal-context.ts'deki aynı gerekçe).
  let companyId: string;
  try {
    companyId = await resolveCompanyId(user, params.companyId);
  } catch (e) {
    if (e instanceof AuthError || e instanceof InputError) redirect("/403");
    throw e;
  }

  const [statement, aging] = await Promise.all([
    getStatement(companyId, { from: searchParams.from, to: searchParams.to }),
    getCompanyAging(companyId).catch(() => null),
  ]);

  const period =
    statement.from || statement.to
      ? `${statement.from ? trDate(statement.from) : "başlangıç"} — ${
          statement.to ? trDate(statement.to) : "bugün"
        }`
      : "Tüm hareketler";

  return (
    <DocumentShell title="Cari Ekstre" subtitle={period}>
      <section className="mb-6 grid gap-6 sm:grid-cols-2">
        <DocumentParty
          label="Firma"
          lines={[
            statement.company.name,
            `Para birimi: ${statement.company.currency}`,
            `Vade: ${statement.company.paymentTermDays} gün`,
          ]}
        />
        <div className="space-y-1">
          <DocumentField
            label="Açılış bakiyesi"
            value={formatTRY(statement.openingBalance)}
          />
          <DocumentField label="Borç" value={formatTRY(statement.totalDebit)} />
          <DocumentField
            label="Alacak"
            value={formatTRY(statement.totalCredit)}
          />
          <DocumentField
            label="Kapanış bakiyesi"
            value={formatTRY(statement.closingBalance)}
            strong
          />
        </div>
      </section>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-neutral-300 text-xs uppercase text-neutral-600">
            <th className="py-2">Tarih</th>
            <th className="py-2">Açıklama</th>
            <th className="py-2">Belge</th>
            <th className="py-2 text-right">Borç</th>
            <th className="py-2 text-right">Alacak</th>
            <th className="py-2 text-right">Bakiye</th>
          </tr>
        </thead>
        <tbody>
          {statement.rows.map((r) => (
            <tr key={r.id} className="border-b border-neutral-200">
              <td className="py-1.5 whitespace-nowrap tabular-nums">
                {trDateTime(r.createdAt)}
              </td>
              <td className="py-1.5">
                {r.description}
                {r.reversalOfId && (
                  <span className="ml-1 text-xs text-neutral-500">(iptal)</span>
                )}
              </td>
              <td className="py-1.5 text-neutral-500">{r.orderNumber ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">
                {Number(r.debit) > 0 ? formatTRY(r.debit) : "—"}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {Number(r.credit) > 0 ? formatTRY(r.credit) : "—"}
              </td>
              <td className="py-1.5 text-right font-medium tabular-nums">
                {formatTRY(r.balance)}
              </td>
            </tr>
          ))}
          {statement.rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-neutral-500">
                Bu aralıkta hareket yok.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {aging && (
        <section className="mt-6 border-t border-neutral-300 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
            Yaşlandırma
          </p>
          <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
            {BUCKET_LABELS.map(([key, label]) => (
              <DocumentField
                key={key}
                label={label}
                value={formatTRY(aging.buckets[key])}
              />
            ))}
            <DocumentField
              label="Vadesi geçen"
              value={formatTRY(aging.overdue)}
              strong
            />
          </div>
          {Number(aging.unappliedCredit) > 0 && (
            <p className="mt-2 text-xs text-neutral-600">
              Mahsup edilmemiş avans: {formatTRY(aging.unappliedCredit)}
            </p>
          )}
        </section>
      )}

      <p className="mt-6 text-xs text-neutral-500">
        Bu ekstre {trDateTime(new Date().toISOString())} tarihinde
        oluşturulmuştur. Bilgi amaçlıdır, mutabakat yerine geçmez.
      </p>
    </DocumentShell>
  );
}
