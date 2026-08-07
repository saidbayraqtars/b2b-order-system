"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserRow } from "@repo/services";
import {
  defaultPermissionsFor,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type Permission,
  type Role,
} from "@repo/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, Select, TextInput } from "@/components/form";
import { PermissionPicker } from "@/components/permission-picker";

/** Sırasız iki izin kümesi aynı mı — PATCH gövdesini gereksiz büyütmemek için. */
function samePermissionSet(a: readonly Permission[], b: readonly Permission[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((p) => set.has(p));
}

// Shared user administration surface.
//
// Used by /admin/users (super admin, every company), the company detail page
// (one company) and /portal/users (a company admin over their own staff). The
// props only decide what the UI offers — the API re-checks every rule, so a
// company admin poking at the endpoint directly gets the same answer.

export function UserManager({
  fixedCompanyId,
  allowedRoles,
  companies,
  currentUserId,
  grantablePermissions,
}: {
  /** Pin every read and write to one company (company detail page / portal). */
  fixedCompanyId?: string;
  allowedRoles: readonly Role[];
  /** Company picker options; omitted when fixedCompanyId is set. */
  companies?: { id: string; name: string }[];
  /** Used to grey out the self-destructive actions the API would reject anyway. */
  currentUserId: string;
  /**
   * Çağıranın kendi izin kümesi = dağıtabileceğinin üst sınırı. Sunucu aynı
   * kuralı yeniden uygular (assertMayGrant), bu yalnızca formu dürüst tutar.
   */
  grantablePermissions: readonly Permission[];
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [creating, setCreating] = useState(false);

  const key = ["admin-users", fixedCompanyId ?? "all", search, includeInactive];
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (fixedCompanyId) qs.set("companyId", fixedCompanyId);
      if (search) qs.set("search", search);
      if (includeInactive) qs.set("includeInactive", "1");
      return apiGet<{ users: UserRow[] }>(`/api/admin/users?${qs}`);
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
    void qc.invalidateQueries({ queryKey: ["admin-companies"] });
  };

  return (
    <Panel
      title="Kullanıcılar"
      action={
        <Button onClick={() => setCreating((v) => !v)}>
          {creating ? "Vazgeç" : "Yeni kullanıcı"}
        </Button>
      }
    >
      {creating && (
        <CreateUserForm
          allowedRoles={allowedRoles}
          companies={companies}
          fixedCompanyId={fixedCompanyId}
          grantablePermissions={grantablePermissions}
          onDone={() => {
            setCreating(false);
            invalidate();
          }}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <TextInput
          value={search}
          placeholder="Ad veya e-posta ara"
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-64"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-500">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Pasifleri de göster
        </label>
      </div>

      {query.isLoading && <p className="text-sm text-neutral-500">Yükleniyor…</p>}
      <ErrorLine error={query.error} />

      {query.data && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">Ad</th>
                <th className="px-3 py-2">E-posta</th>
                <th className="px-3 py-2">Rol</th>
                {!fixedCompanyId && <th className="px-3 py-2">Firma</th>}
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {query.data.users.map((u) => (
                <UserRowView
                  key={u.id}
                  user={u}
                  allowedRoles={allowedRoles}
                  grantablePermissions={grantablePermissions}
                  showCompany={!fixedCompanyId}
                  isSelf={u.id === currentUserId}
                  onChanged={invalidate}
                />
              ))}
              {query.data.users.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-neutral-500"
                    colSpan={fixedCompanyId ? 5 : 6}
                  >
                    Kullanıcı yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function CreateUserForm({
  allowedRoles,
  companies,
  fixedCompanyId,
  grantablePermissions,
  onDone,
}: {
  allowedRoles: readonly Role[];
  companies?: { id: string; name: string }[];
  fixedCompanyId?: string;
  grantablePermissions: readonly Permission[];
  onDone: () => void;
}) {
  const initialRole = allowedRoles[0] ?? "COMPANY_STAFF";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>(initialRole);
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? "");
  const [password, setPassword] = useState("");
  // Yeni hesap: rolün şablonuyla başla, sonra tek tek düzelt. Elle bir tik
  // atıldıktan sonra rol değişse bile küme ezilmez (bkz. handleRoleChange).
  const [permissions, setPermissions] = useState<Permission[]>(() =>
    defaultPermissionsFor(initialRole).filter((p) => grantablePermissions.includes(p)),
  );
  const [touchedPermissions, setTouchedPermissions] = useState(false);

  const changeRole = (next: Role) => {
    setRole(next);
    if (!touchedPermissions) {
      setPermissions(
        defaultPermissionsFor(next).filter((p) => grantablePermissions.includes(p)),
      );
    }
  };

  // Only the two company roles carry a company; the picker would be misleading
  // for a super admin or a sales rep.
  const needsCompany = role === "COMPANY_ADMIN" || role === "COMPANY_STAFF";

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/users", {
        email,
        name,
        phone: phone || undefined,
        role,
        password,
        permissions,
        companyId: needsCompany ? (fixedCompanyId ?? companyId) : undefined,
      }),
    onSuccess: () => {
      setEmail("");
      setName("");
      setPhone("");
      setPassword("");
      onDone();
    },
  });

  return (
    <div className="mb-4 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          <Label>Ad soyad</Label>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <Label>E-posta</Label>
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          <Label>Telefon</Label>
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          <Label hint="yetki şablonunu belirler">Rol</Label>
          <Select value={role} onChange={(e) => changeRole(e.target.value as Role)}>
            {allowedRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </label>
        {needsCompany && !fixedCompanyId && (
          <label>
            <Label>Firma</Label>
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Seçin</option>
              {(companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label>
          <Label hint="en az 8 karakter, harf + rakam">Şifre</Label>
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-3">
        <PermissionPicker
          value={permissions}
          role={role}
          grantable={grantablePermissions}
          onChange={(next) => {
            setPermissions(next);
            setTouchedPermissions(true);
          }}
        />
      </div>

      <div className="mt-3">
        <Button
          disabled={
            create.isPending ||
            !name.trim() ||
            !email.trim() ||
            !password ||
            (needsCompany && !fixedCompanyId && !companyId)
          }
          onClick={() => create.mutate()}
        >
          Oluştur
        </Button>
        {permissions.length === 0 && (
          <span className="ml-3 text-xs text-amber-600 dark:text-amber-400">
            Hiç yetki seçilmedi — bu hesap giriş yapar ama hiçbir ekranı açamaz.
          </span>
        )}
      </div>
      <ErrorLine error={create.error} />
    </div>
  );
}

function UserRowView({
  user,
  allowedRoles,
  grantablePermissions,
  showCompany,
  isSelf,
  onChanged,
}: {
  user: UserRow;
  allowedRoles: readonly Role[];
  grantablePermissions: readonly Permission[];
  showCompany: boolean;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState<Role>(user.role);
  const [permissions, setPermissions] = useState<Permission[]>(user.permissions);
  const [password, setPassword] = useState("");

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch(`/api/admin/users/${user.id}`, body),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });

  const setPass = useMutation({
    mutationFn: () => apiPost(`/api/admin/users/${user.id}/password`, { password }),
    onSuccess: () => setPassword(""),
  });

  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/users/${user.id}`),
    onSuccess: onChanged,
  });

  const error = patch.error ?? setPass.error ?? remove.error;

  if (editing) {
    return (
      <tr>
        <td className="px-3 py-2" colSpan={showCompany ? 6 : 5}>
          <div className="flex flex-wrap items-end gap-2">
            <label>
              <Label>Ad</Label>
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-44"
              />
            </label>
            <label>
              <Label>Telefon</Label>
              <TextInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-36"
              />
            </label>
            <label>
              <Label>Rol</Label>
              <Select
                value={role}
                disabled={isSelf}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-44"
              >
                {allowedRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
                {!allowedRoles.includes(user.role) && (
                  <option value={user.role}>{ROLE_LABELS[user.role]}</option>
                )}
              </Select>
            </label>
            <label>
              <Label hint="boş bırakırsanız değişmez">Yeni şifre</Label>
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-44"
              />
            </label>
            <div className="w-full">
              <PermissionPicker
                value={permissions}
                role={role}
                grantable={grantablePermissions}
                onChange={setPermissions}
              />
              {isSelf && (
                <p className="mt-1 text-xs text-neutral-500">
                  Kendi hesabınızı düzenliyorsunuz: kullanıcı yönetimi yetkisini
                  kaldıramazsınız, aksi hâlde geri açacak kimse kalmaz.
                </p>
              )}
            </div>
            <Button
              disabled={patch.isPending || setPass.isPending}
              onClick={async () => {
                if (password) await setPass.mutateAsync();
                patch.mutate({
                  name,
                  phone: phone || null,
                  ...(role !== user.role ? { role } : {}),
                  // Değişmediyse gönderilmiyor: her kaydetmede izin yazmak
                  // denetim kaydını anlamsız "yetki değişti" satırlarıyla
                  // doldurur ve oturumları boşuna sonlandırır.
                  ...(samePermissionSet(permissions, user.permissions)
                    ? {}
                    : { permissions }),
                });
              }}
            >
              Kaydet
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
          </div>
          <ErrorLine error={error} />
        </td>
      </tr>
    );
  }

  return (
    <tr className={user.isActive ? "" : "opacity-60"}>
      <td className="px-3 py-2 font-medium">{user.name}</td>
      <td className="px-3 py-2 text-neutral-500">{user.email}</td>
      <td className="px-3 py-2">
        {ROLE_LABELS[user.role]}
        {user.managedCompanyCount > 0 && (
          <span className="ml-2 text-xs text-neutral-500">
            {user.managedCompanyCount} firma
          </span>
        )}
        {/* Rol artık yetkiyi anlatmadığı için sayısı da yazılıyor: aynı roldeki
            iki hesabın farklı yetkileri olabilir. */}
        <span
          className="ml-2 text-xs text-neutral-400"
          title={
            user.permissions.length > 0
              ? user.permissions.map((p) => PERMISSION_LABELS[p]).join("\n")
              : "Hiç yetki yok"
          }
        >
          {user.permissions.length} yetki
        </span>
      </td>
      {showCompany && (
        <td className="px-3 py-2 text-neutral-500">{user.company?.name ?? "—"}</td>
      )}
      <td className="px-3 py-2">
        {user.isActive ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            aktif
          </span>
        ) : (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            pasif
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Düzenle
          </Button>
          <Button
            variant="secondary"
            disabled={isSelf || patch.isPending}
            title={isSelf ? "Kendi hesabınızı pasife alamazsınız" : undefined}
            onClick={() => patch.mutate({ isActive: !user.isActive })}
          >
            {user.isActive ? "Pasife al" : "Aktifleştir"}
          </Button>
          <Button
            variant="danger"
            disabled={isSelf || remove.isPending}
            onClick={() => {
              if (confirm(`${user.name} silinsin mi? İşlem geçmişi varsa silinemez.`)) {
                remove.mutate();
              }
            }}
          >
            Sil
          </Button>
        </div>
        <ErrorLine error={error} />
      </td>
    </tr>
  );
}
