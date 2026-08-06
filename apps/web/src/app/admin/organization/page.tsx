import { brandingUrl, loadTenant, tenantDir } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";

// Kuruluş bilgileri — who this installation prints documents as.
//
// Read-only on purpose. The tenant folder is the source of truth, and an edit
// form here would create a second one: the operator would change a field on
// screen, the file on disk would still say something else, and the next support
// hand-over would silently revert the change. Editing happens in the folder.

export default async function AdminOrganizationPage() {
  const user = await requirePage(["SUPER_ADMIN"]);

  let tenant: Awaited<ReturnType<typeof loadTenant>> | null = null;
  let problem: string | null = null;
  let dir: string | null = null;
  try {
    dir = tenantDir();
    tenant = await loadTenant();
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <AdminNav email={user.email} current="/admin/organization" />
      <main className="mx-auto max-w-4xl space-y-5 px-4 pb-6">
        <div>
          <h1 className="text-xl font-bold">Kuruluş</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Faturaya ve irsaliyeye basılan satıcı bilgileri. Kaynak{" "}
            <strong>dosyadır</strong>, veritabanı değil:{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-800">
              {dir ? `${dir}\\tenant.json` : "TENANT_DIR tanımsız"}
            </code>
            . Dosyayı düzenleyip sayfayı yenilemek yeter — sunucuyu yeniden
            başlatmak gerekmez.
          </p>
        </div>

        {problem && (
          <section className="rounded-lg border-2 border-red-400 bg-red-50 p-4 text-red-800 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-semibold">Kuruluş bilgisi okunamadı</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs">{problem}</pre>
            <p className="mt-3 text-sm">
              Bu hâlde fatura ve irsaliye <strong>geçersiz</strong> basılır: belge
              başlığında satıcı yerine bu hata görünür. Kurulum tamamlanmadan
              belge kesmeyin.
            </p>
          </section>
        )}

        {tenant && <TenantView tenant={tenant} />}
      </main>
    </div>
  );
}

function TenantView({
  tenant,
}: {
  tenant: Awaited<ReturnType<typeof loadTenant>>;
}) {
  const { seller, branding, slug } = tenant;
  const logo = brandingUrl(branding.logo);
  const a = seller.address;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{seller.legalName}</h2>
          {seller.tradeName && (
            <p className="text-sm text-neutral-500">{seller.tradeName}</p>
          )}
          <p className="mt-1 text-xs text-neutral-400">Kiracı: {slug}</p>
        </div>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={seller.legalName}
            className="h-12 w-auto max-w-[220px] object-contain object-right"
          />
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="Vergi dairesi" value={seller.taxOffice} />
        <Field label="VKN / TCKN" value={seller.taxNumber} />
        <Field label="MERSİS" value={seller.mersisNo} />
        <Field label="Ticaret sicil no" value={seller.tradeRegistryNo} />
        <Field
          label="Adres"
          value={[a.line1, a.line2, [a.district, a.city, a.postalCode].filter(Boolean).join(" / "), a.country]
            .filter(Boolean)
            .join("\n")}
        />
        <div className="space-y-2">
          <Field label="Telefon" value={seller.phone} />
          <Field label="E-posta" value={seller.email} />
          <Field label="Web" value={seller.website} />
        </div>
      </dl>

      {seller.bankAccounts.length > 0 && (
        <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">
            Faturaya basılan hesaplar
          </p>
          {seller.bankAccounts.map((b) => (
            <p key={b.iban} className="text-sm">
              <span className="text-neutral-500">{b.label}</span>{" "}
              <span className="font-mono tabular-nums">{b.iban}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase text-neutral-400">{label}</dt>
      <dd className="whitespace-pre-line text-neutral-900 dark:text-neutral-100">
        {value && value.trim() !== "" ? value : "—"}
      </dd>
    </div>
  );
}
