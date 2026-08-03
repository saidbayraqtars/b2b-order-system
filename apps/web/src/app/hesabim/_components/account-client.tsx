"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  AUDIT_ACTION_LABELS,
  changePasswordSchema,
  updateProfileSchema,
  type AuditEntry,
} from "@repo/types";
import type { AccountProfile as Account } from "@repo/services";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
import { apiPatch, apiPost } from "@/lib/fetcher";

/**
 * Self-service account screen: profile, password and the user's own audit
 * entries. Server-rendered once, then edited in place — the page is small
 * enough that a query cache would be more machinery than it is worth.
 */
export function AccountClient({
  initialAccount,
  initialActivity,
}: {
  initialAccount: Account;
  initialActivity: AuditEntry[];
}) {
  const [account, setAccount] = useState(initialAccount);

  return (
    <div className="flex flex-col gap-6">
      <ProfilePanel account={account} onSaved={setAccount} />
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
