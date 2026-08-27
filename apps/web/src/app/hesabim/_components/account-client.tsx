"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  AUDIT_ACTION_LABELS,
  changePasswordSchema,
  updateProfileSchema,
  type AuditEntry,
} from "@repo/types";
import type {
  AccountProfile as Account,
  EnrollmentStart,
  TwoFactorStatus,
} from "@repo/services";
import {
  Button,
  ErrorLine,
  Label,
  Panel,
  TextInput,
  WarnLine,
} from "@/components/form";
import {
  DefRow,
  Note,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { apiDelete, apiPatch, apiPost } from "@/lib/fetcher";

/**
 * Self-service account screen: profile, password and the user's own audit
 * entries. Server-rendered once, then edited in place — the page is small
 * enough that a query cache would be more machinery than it is worth.
 */
export function AccountClient({
  initialAccount,
  initialActivity,
  initialTwoFactor,
}: {
  initialAccount: Account;
  initialActivity: AuditEntry[];
  initialTwoFactor: TwoFactorStatus | null;
}) {
  const [account, setAccount] = useState(initialAccount);

  return (
    <div className="flex flex-col gap-6">
      <ProfilePanel account={account} onSaved={setAccount} />
      {initialTwoFactor && <TwoFactorPanel initial={initialTwoFactor} />}
      <SecurityPanel account={account} />
      <PasswordPanel />
      <ActivityPanel entries={initialActivity} />
    </div>
  );
}

function ProfilePanel({
  account,
  onSaved,
}: {
  account: Account;
  onSaved: (a: Account) => void;
}) {
  const [name, setName] = useState(account.name);
  const [phone, setPhone] = useState(account.phone ?? "");
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    const parsed = updateProfileSchema.safeParse({ name, phone });
    if (!parsed.success) {
      setError(new Error(parsed.error.issues[0]?.message ?? "Geçersiz form"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiPatch<{ account: Account }>(
        "/api/account",
        parsed.data,
      );
      onSaved(res.account);
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Profil">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="account-name">Ad soyad</Label>
          <TextInput
            id="account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="account-phone">Telefon</Label>
          <TextInput
            id="account-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="account-email" hint="(değiştirilemez)">
            E-posta
          </Label>
          <TextInput id="account-email" value={account.email} disabled />
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        E-posta, rol ve firma bilgisi yalnızca yönetici tarafından değiştirilir.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} loading={busy}>
          Kaydet
        </Button>
        {/* Yeşil, küçük, kutusuz: "oldu" demenin ağırlığı bu kadar. */}
        {saved && (
          <span className="text-body-sm text-positive">Kaydedildi</span>
        )}
      </div>
      <ErrorLine error={error} />
    </Panel>
  );
}

function SecurityPanel({ account }: { account: Account }) {
  return (
    <Panel title="Güvenlik durumu">
      {/* `DefRow`: bu panel künye satırını kendi yazıyordu ve ölçüleri ortak
          bileşenden yarım punto farklıydı. */}
      <dl className="grid gap-x-6 sm:grid-cols-2 sm:[&>div:nth-last-child(-n+2)]:border-b-0">
        <DefRow label="Son giriş">{formatDateTime(account.lastLoginAt)}</DefRow>
        <DefRow label="Son giriş IP">{account.lastLoginIp ?? "—"}</DefRow>
        <DefRow label="Şifre son değişim">
          {formatDateTime(account.passwordChangedAt)}
        </DefRow>
        <DefRow label="Hesap açılışı">
          {formatDateTime(account.createdAt)}
        </DefRow>
      </dl>
    </Panel>
  );
}

/**
 * İki adımlı doğrulama paneli.
 *
 * Dört hâl var ve hepsi aynı panelde: kurulamaz (şifreleme anahtarı yok),
 * kapalı, kurulum sürüyor, açık. Ayrı ekranlara bölmek, zorunlu kapsamdaki
 * kullanıcının kendini nerede bulacağını belirsizleştirirdi — kapı onu buraya
 * yolluyor, gerisi tek yerde.
 */
function TwoFactorPanel({ initial }: { initial: TwoFactorStatus }) {
  const [status, setStatus] = useState(initial);
  const [enrollment, setEnrollment] = useState<EnrollmentStart | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const begin = () =>
    run(async () => {
      const res = await apiPost<{ enrollment: EnrollmentStart }>(
        "/api/account/two-factor",
        {},
      );
      setEnrollment(res.enrollment);
      setCode("");
    });

  const confirm = () =>
    run(async () => {
      const res = await apiPost<{ backupCodes: string[] }>(
        "/api/account/two-factor/confirm",
        { code },
      );
      setBackupCodes(res.backupCodes);
      setEnrollment(null);
      setCode("");
      setStatus({
        ...status,
        enabled: true,
        pending: false,
        enabledAt: new Date(),
        remainingBackupCodes: res.backupCodes.length,
      });
    });

  const regenerate = () =>
    run(async () => {
      const res = await apiPost<{ backupCodes: string[] }>(
        "/api/account/two-factor/backup-codes",
        { code },
      );
      setBackupCodes(res.backupCodes);
      setCode("");
      setStatus({ ...status, remainingBackupCodes: res.backupCodes.length });
    });

  const disable = () =>
    run(async () => {
      await apiDelete("/api/account/two-factor", { code });
      // Kapatma da tüm oturumları düşürdü; sayfada kalmak yalnızca 401 üretir.
      void signOut({ callbackUrl: "/login" });
    });

  // ── şifreleme anahtarı yoksa hiçbir şey kurulamaz
  if (!status.ready) {
    return (
      <Panel title="İki adımlı doğrulama">
        <WarnLine>
          <span>
            Sunucuda <code>TOTP_ENCRYPTION_KEY</code> tanımlı olmadığı için iki
            adımlı doğrulama kurulamıyor. Sistem yöneticinize bildirin.
          </span>
        </WarnLine>
      </Panel>
    );
  }

  // ── yeni üretilmiş yedek kodlar: her şeyin önüne geçer
  if (backupCodes) {
    return (
      <Panel title="Yedek kodlarınız">
        <p className="text-body-sm text-ink">
          Bu kodları{" "}
          <strong className="font-semibold">şimdi</strong> kaydedin — bir daha
          gösterilmeyecek. Her biri bir kez kullanılır ve telefonunuza
          erişemediğinizde doğrulama kodunun yerine geçer.
        </p>
        <ul className="my-3 grid grid-cols-2 gap-2 font-mono text-body-sm sm:grid-cols-3">
          {backupCodes.map((c) => (
            <li
              key={c}
              className="rounded border border-line bg-sunken px-2 py-1 text-center tracking-wider text-ink"
            >
              {c}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          {/* Ekranın asıl eylemi "kaydettim, devam et"; kopyalama ona giden
              yol. İkisi de siyah düğme olsaydı hangisinin ileri götürdüğü
              belirsiz kalırdı. */}
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(backupCodes.join("\n"))
            }
          >
            Kopyala
          </Button>
          {status.enabled && (
            <Button onClick={() => void signOut({ callbackUrl: "/login" })}>
              Kaydettim, yeniden giriş yap
            </Button>
          )}
          {!status.enabled && (
            <Button variant="secondary" onClick={() => setBackupCodes(null)}>
              Kapat
            </Button>
          )}
        </div>
        {status.enabled && (
          <p className="mt-2 text-xs text-ink-faint">
            İki adımlı doğrulama açıldığı için açık olan tüm oturumlar (mobil
            dahil) kapatıldı. Yeniden girerken kodu bir kez daha soracağız.
          </p>
        )}
      </Panel>
    );
  }

  // ── kurulum sürüyor: QR + doğrulama
  if (enrollment) {
    return (
      <Panel title="İki adımlı doğrulama — kurulum">
        <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-body-sm text-ink-muted">
          <li>
            Telefonunuzda bir authenticator uygulaması açın (Google
            Authenticator, Microsoft Authenticator, Authy, 1Password…).
          </li>
          <li>Aşağıdaki kareyi okutun.</li>
          <li>Uygulamanın gösterdiği altı haneli kodu buraya yazın.</li>
        </ol>

        <div className="flex flex-col items-start gap-4 sm:flex-row">
          {/* Sunucuda üretilmiş SVG (packages/services/src/qr.ts). Dışarıdan
              gelen bir içerik değil, bu yüzden doğrudan basılıyor. */}
          {/* Kare her zaman beyaz zeminde: okuyucu uygulamaların yarısı koyu
              zemindeki QR'ı çözemiyor ve bu, temaya bırakılacak bir tercih
              değil. */}
          <div
            className="rounded border border-line bg-white p-2"
            dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
          />
          <div>
            <p className="text-body-sm text-ink-muted">
              QR okutamıyorsanız anahtarı elle girin:
            </p>
            <p className="mt-1 select-all font-mono text-body-md tracking-wider text-ink">
              {enrollment.manualKey}
            </p>
            <p className="mt-2 text-xs text-ink-faint">
              Hesap adı: {enrollment.issuer} · Tür: zamana dayalı (TOTP), 6
              hane, 30 saniye.
            </p>
          </div>
        </div>

        <div className="mt-4 max-w-xs">
          <Label htmlFor="totp-enroll-code">Uygulamadaki kod</Label>
          <TextInput
            id="totp-enroll-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={confirm}
            loading={busy}
            disabled={!code.trim()}
          >
            Doğrula ve aç
          </Button>
          <Button
            variant="secondary"
            onClick={() => setEnrollment(null)}
            disabled={busy}
          >
            Vazgeç
          </Button>
        </div>
        <ErrorLine error={error} />
      </Panel>
    );
  }

  // ── açık
  if (status.enabled) {
    return (
      <Panel title="İki adımlı doğrulama">
        <p className="text-body-sm text-positive">
          Açık
          {status.enabledAt
            ? ` — ${formatDateTime(new Date(status.enabledAt).toISOString())}`
            : ""}
          .
        </p>
        <p className="mt-1 text-body-sm text-ink-muted">
          Kalan yedek kod:{" "}
          <span className="tabular-nums">{status.remainingBackupCodes}</span>
          {status.remainingBackupCodes <= 2 && (
            <span className="ml-2 text-caution">
              Azaldı — yenilemeniz iyi olur.
            </span>
          )}
        </p>

        <div className="mt-3 max-w-xs">
          <Label
            htmlFor="totp-code"
            hint="uygulamadaki kod ya da bir yedek kod"
          >
            Doğrulama kodu
          </Label>
          <TextInput
            id="totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={regenerate} loading={busy} disabled={!code.trim()}>
            Yedek kodları yenile
          </Button>
          {/* Kapatma bu panelin asıl eylemi değil ve hesabın korumasını
              kaldırıyor: sessiz kırmızı (Adım 4 kuralı). */}
          {!status.required && (
            <Button
              variant="dangerQuiet"
              onClick={disable}
              disabled={busy || !code.trim()}
            >
              Kapat
            </Button>
          )}
        </div>
        {status.required && (
          <Note className="mt-4">
            {status.requirementReason} iki adımlı doğrulama zorunlu;
            kapatılamaz. Telefonunuzu değiştirecekseniz yöneticinize sıfırlatın.
          </Note>
        )}
        <ErrorLine error={error} />
      </Panel>
    );
  }

  // ── kapalı
  return (
    <Panel title="İki adımlı doğrulama">
      {status.required ? (
        <WarnLine>
          <span>
            {status.requirementReason} bu hesapta iki adımlı doğrulama zorunlu.
            Kurmadan diğer ekranlara giremezsiniz.
          </span>
        </WarnLine>
      ) : (
        <p className="text-body-sm text-ink-muted">
          Kapalı. Açtığınızda girişte şifrenizin yanında telefonunuzdaki altı
          haneli kod da istenir; şifreniz ele geçse bile hesabınıza girilemez.
        </p>
      )}
      {status.pending && (
        <p className="mt-2 text-xs text-ink-faint">
          Yarım kalmış bir kurulum var. Yeniden başlatmak yeni bir anahtar
          üretir; eski kareyi okuttuysanız uygulamadaki kaydı silin.
        </p>
      )}
      <div className="mt-3">
        <Button onClick={begin} loading={busy}>
          {status.pending ? "Yeniden kur" : "Kur"}
        </Button>
      </div>
      <ErrorLine error={error} />
    </Panel>
  );
}

function PasswordPanel() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword !== repeat) {
      setError(new Error("Yeni şifre tekrarı eşleşmiyor"));
      return;
    }
    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
    });
    if (!parsed.success) {
      setError(new Error(parsed.error.issues[0]?.message ?? "Geçersiz form"));
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/account/password", parsed.data);
      setDone(true);
      // Changing the password revokes every session, this one included. Staying
      // on the page would only produce 401s on the next click.
      setTimeout(() => void signOut({ callbackUrl: "/login" }), 1500);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Panel title="Şifre değiştir">
        <p className="text-body-sm text-positive">
          Şifreniz değiştirildi. Tüm oturumlar kapatıldı — giriş ekranına
          yönlendiriliyorsunuz…
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Şifre değiştir">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="password-current">Mevcut şifre</Label>
          <TextInput
            id="password-current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password-new" hint="en az 8 karakter, harf + rakam">
            Yeni şifre
          </Label>
          <TextInput
            id="password-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password-repeat">Yeni şifre (tekrar)</Label>
          <TextInput
            id="password-repeat"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        Şifre değiştiğinde açık olan tüm oturumlar (mobil dahil) kapatılır.
      </p>
      <div className="mt-3">
        <Button onClick={submit} loading={busy}>
          Şifreyi değiştir
        </Button>
      </div>
      <ErrorLine error={error} />
    </Panel>
  );
}

/**
 * Kullanıcının kendi denetim kaydı — yönetimdeki güvenlik kaydının tek kişilik
 * hâli, o yüzden görüntüsü de aynı: aynı veri iki ekranda iki farklı biçimde
 * durmasın (Adım 6'da beş liste bu sebeple tabloya geçmişti).
 */
function ActivityPanel({ entries }: { entries: AuditEntry[] }) {
  return (
    <Panel title="Son hareketlerim" bodyClassName="p-0 pb-1">
      <Table>
        <THead>
          <tr>
            <Th>İşlem</Th>
            <Th>Özet</Th>
            <Th align="right">Zaman</Th>
          </tr>
        </THead>
        <TBody>
          {entries.map((e) => (
            <tr key={e.id}>
              <Td className="font-medium">{AUDIT_ACTION_LABELS[e.action]}</Td>
              <Td muted>{e.summary}</Td>
              <Td align="right" numeric muted>
                {formatDateTime(e.createdAt)}
                {e.ip ? ` · ${e.ip}` : ""}
              </Td>
            </tr>
          ))}
          {entries.length === 0 && (
            <TableEmpty colSpan={3} label="Kayıt yok." />
          )}
        </TBody>
      </Table>
    </Panel>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
