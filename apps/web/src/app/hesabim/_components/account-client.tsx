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
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
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
      const res = await apiPatch<{ account: Account }>("/api/account", parsed.data);
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
          <Label>Ad soyad</Label>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Telefon</Label>
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label hint="(değiştirilemez)">E-posta</Label>
          <TextInput value={account.email} disabled />
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        E-posta, rol ve firma bilgisi yalnızca yönetici tarafından değiştirilir.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Kaydedildi</span>}
      </div>
      <ErrorLine error={error} />
    </Panel>
  );
}

function SecurityPanel({ account }: { account: Account }) {
  return (
    <Panel title="Güvenlik durumu">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="Son giriş" value={formatDateTime(account.lastLoginAt)} />
        <Row label="Son giriş IP" value={account.lastLoginIp ?? "—"} />
        <Row
          label="Şifre son değişim"
          value={formatDateTime(account.passwordChangedAt)}
        />
        <Row label="Hesap açılışı" value={formatDateTime(account.createdAt)} />
      </dl>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-neutral-100 py-1 dark:border-neutral-900">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
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
        <p className="text-sm text-amber-600">
          Sunucuda <code>TOTP_ENCRYPTION_KEY</code> tanımlı olmadığı için iki
          adımlı doğrulama kurulamıyor. Sistem yöneticinize bildirin.
        </p>
      </Panel>
    );
  }

  // ── yeni üretilmiş yedek kodlar: her şeyin önüne geçer
  if (backupCodes) {
    return (
      <Panel title="Yedek kodlarınız">
        <p className="text-sm">
          Bu kodları <strong>şimdi</strong> kaydedin — bir daha
          gösterilmeyecek. Her biri bir kez kullanılır ve telefonunuza
          erişemediğinizde doğrulama kodunun yerine geçer.
        </p>
        <ul className="my-3 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">
          {backupCodes.map((c) => (
            <li
              key={c}
              className="rounded border border-neutral-200 px-2 py-1 text-center dark:border-neutral-800"
            >
              {c}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void navigator.clipboard?.writeText(backupCodes.join("\n"))}
          >
            Kopyala
          </Button>
          {status.enabled && (
            <Button onClick={() => void signOut({ callbackUrl: "/login" })}>
              Kaydettim, yeniden giriş yap
            </Button>
          )}
          {!status.enabled && (
            <Button onClick={() => setBackupCodes(null)}>Kapat</Button>
          )}
        </div>
        {status.enabled && (
          <p className="mt-2 text-xs text-neutral-500">
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
        <ol className="mb-3 list-decimal pl-5 text-sm text-neutral-600 dark:text-neutral-400">
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
          <div
            className="rounded border border-neutral-200 bg-white p-2 dark:border-neutral-800"
            dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
          />
          <div className="text-sm">
            <p className="text-neutral-500">
              QR okutamıyorsanız anahtarı elle girin:
            </p>
            <p className="mt-1 select-all font-mono text-base tracking-wider">
              {enrollment.manualKey}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Hesap adı: {enrollment.issuer} · Tür: zamana dayalı (TOTP), 6
              hane, 30 saniye.
            </p>
          </div>
        </div>

        <div className="mt-4 max-w-xs">
          <Label>Uygulamadaki kod</Label>
          <TextInput
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={confirm} disabled={busy || !code.trim()}>
            {busy ? "Doğrulanıyor…" : "Doğrula ve aç"}
          </Button>
          <Button onClick={() => setEnrollment(null)} disabled={busy}>
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
        <p className="text-sm text-emerald-600">
          Açık
          {status.enabledAt
            ? ` — ${formatDateTime(new Date(status.enabledAt).toISOString())}`
            : ""}
          .
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Kalan yedek kod: {status.remainingBackupCodes}
          {status.remainingBackupCodes <= 2 && (
            <span className="ml-2 text-amber-600">
              Azaldı — yenilemeniz iyi olur.
            </span>
          )}
        </p>

        <div className="mt-3 max-w-xs">
          <Label hint="uygulamadaki kod ya da bir yedek kod">
            Doğrulama kodu
          </Label>
          <TextInput
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={regenerate} disabled={busy || !code.trim()}>
            Yedek kodları yenile
          </Button>
          {!status.required && (
            <Button onClick={disable} disabled={busy || !code.trim()}>
              Kapat
            </Button>
          )}
        </div>
        {status.required && (
          <p className="mt-2 text-xs text-neutral-500">
            {status.requirementReason} iki adımlı doğrulama zorunlu; kapatılamaz.
            Telefonunuzu değiştirecekseniz yöneticinize sıfırlatın.
          </p>
        )}
        <ErrorLine error={error} />
      </Panel>
    );
  }

  // ── kapalı
  return (
    <Panel title="İki adımlı doğrulama">
      {status.required ? (
        <p className="text-sm text-amber-600">
          {status.requirementReason} bu hesapta iki adımlı doğrulama zorunlu.
          Kurmadan diğer ekranlara giremezsiniz.
        </p>
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Kapalı. Açtığınızda girişte şifrenizin yanında telefonunuzdaki altı
          haneli kod da istenir; şifreniz ele geçse bile hesabınıza girilemez.
        </p>
      )}
      {status.pending && (
        <p className="mt-1 text-xs text-neutral-500">
          Yarım kalmış bir kurulum var. Yeniden başlatmak yeni bir anahtar
          üretir; eski kareyi okuttuysanız uygulamadaki kaydı silin.
        </p>
      )}
      <div className="mt-3">
        <Button onClick={begin} disabled={busy}>
          {busy ? "Hazırlanıyor…" : status.pending ? "Yeniden kur" : "Kur"}
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
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
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
        <p className="text-sm text-emerald-600">
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
          <Label>Mevcut şifre</Label>
          <TextInput
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div>
          <Label hint="en az 8 karakter, harf + rakam">Yeni şifre</Label>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div>
          <Label>Yeni şifre (tekrar)</Label>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Şifre değiştiğinde açık olan tüm oturumlar (mobil dahil) kapatılır.
      </p>
      <div className="mt-3">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Değiştiriliyor…" : "Şifreyi değiştir"}
        </Button>
      </div>
      <ErrorLine error={error} />
    </Panel>
  );
}

function ActivityPanel({ entries }: { entries: AuditEntry[] }) {
  return (
    <Panel title="Son hareketlerim">
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">Kayıt yok.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 py-1 dark:border-neutral-900"
            >
              <span>
                <span className="font-medium">{AUDIT_ACTION_LABELS[e.action]}</span>
                <span className="ml-2 text-neutral-500">{e.summary}</span>
              </span>
              <span className="text-xs text-neutral-400">
                {formatDateTime(e.createdAt)}
                {e.ip ? ` · ${e.ip}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
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
