import { brandingUrl, loadTenant, tenantDir } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { Field, Note, PageHeader } from "@/components/ui";
import { Panel } from "@/components/form";

// Kuruluş bilgileri — who this installation prints documents as.
//
// Read-only on purpose. The tenant folder is the source of truth, and an edit
// form here would create a second one: the operator would change a field on
// screen, the file on disk would still say something else, and the next support
// hand-over would silently revert the change. Editing happens in the folder.

export default async function AdminOrganizationPage() {
  await requirePage(["SUPER_ADMIN"], "organization.manage");

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
    <main className="mx-auto max-w-4xl">
      <PageHeader
        title="Kuruluş"
        subtitle="Faturaya ve irsaliyeye basılan satıcı bilgileri"
      />

      {problem && (
        <section className="mb-5 rounded-lg border border-critical/30 bg-critical/10 p-4 text-critical">
          <p className="text-headline-sm">Kuruluş bilgisi okunamadı</p>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
            {problem}
          </pre>
          <p className="mt-3 text-body-sm">
            Bu hâlde fatura ve irsaliye <strong>geçersiz</strong> basılır: belge
            başlığında satıcı yerine bu hata görünür. Kurulum tamamlanmadan
            belge kesmeyin.
          </p>
        </section>
      )}

      {tenant && <TenantView tenant={tenant} />}

      <Note>
        Kaynak <strong>dosyadır</strong>, veritabanı değil:{" "}
        <code className="rounded bg-sunken px-1 py-0.5 font-mono text-xs">
          {dir ? `${dir}\\tenant.json` : "TENANT_DIR tanımsız"}
        </code>
        . Bu ekranda düzenleme yok, çünkü olsaydı iki kaynak olurdu: ekranda
        değiştirilen alan diskteki dosyada eski hâliyle kalır ve bir sonraki
        devir teslimde sessizce geri gelirdi. Dosyayı düzenleyip sayfayı
        yenilemek yeter — sunucuyu yeniden başlatmak gerekmez.
      </Note>
    </main>
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
    <Panel title={seller.legalName}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {seller.tradeName && (
            <p className="text-body-sm text-ink-muted">{seller.tradeName}</p>
          )}
          <p className="mt-1 text-xs text-ink-faint">Kiracı: {slug}</p>
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

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Vergi dairesi">{fallback(seller.taxOffice)}</Field>
        <Field label="VKN / TCKN">{fallback(seller.taxNumber)}</Field>
        <Field label="MERSİS">{fallback(seller.mersisNo)}</Field>
        <Field label="Ticaret sicil no">
          {fallback(seller.tradeRegistryNo)}
        </Field>
        <Field label="Adres">
          {fallback(
            [
              a.line1,
              a.line2,
              [a.district, a.city, a.postalCode].filter(Boolean).join(" / "),
              a.country,
            ]
              .filter(Boolean)
              .join("\n"),
          )}
        </Field>
        <div className="space-y-3">
          <Field label="Telefon">{fallback(seller.phone)}</Field>
          <Field label="E-posta">{fallback(seller.email)}</Field>
          <Field label="Web">{fallback(seller.website)}</Field>
        </div>
      </dl>

      {seller.bankAccounts.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="tech-label mb-1">Faturaya basılan hesaplar</p>
          {seller.bankAccounts.map((b) => (
            <p key={b.iban} className="text-body-sm">
              <span className="text-ink-muted">{b.label}</span>{" "}
              <span className="font-mono tabular-nums text-ink">{b.iban}</span>
            </p>
          ))}
        </div>
      )}
    </Panel>
  );
}

function fallback(value?: string | null): string {
  return value && value.trim() !== "" ? value : "—";
}
