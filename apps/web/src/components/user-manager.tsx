"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserRow } from "@repo/services";
import {
  defaultPermissionsFor,
  isPermissionGrantableTo,
  PERMISSION_LABELS,
  ROLE_FAMILY,
  ROLE_FAMILY_LABELS,
  ROLE_LABELS,
  type Permission,
  type Role,
  type RoleFamily,
} from "@repo/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { PermissionPicker } from "@/components/permission-picker";
import {
  Badge,
  LoadingState,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
  Tabs,
} from "@/components/ui";

/** Sırasız iki izin kümesi aynı mı — PATCH gövdesini gereksiz büyütmemek için. */
function samePermissionSet(
  a: readonly Permission[],
  b: readonly Permission[],
): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((p) => set.has(p));
}

/**
 * Rolün şablonu, iki sınırdan geçirilmiş: çağıranın kendi kümesi ve hesap
 * tipinin kapsamı. Şablon zaten kapsam içinde olmalı, ama süzgeç yine burada —
 * kayıt defteri ile şablon bir gün ayrışırsa form yine geçerli bir küme üretir.
 */
function templateFor(
  role: Role,
  grantable: readonly Permission[],
): Permission[] {
  return defaultPermissionsFor(role).filter(
    (p) => grantable.includes(p) && isPermissionGrantableTo(p, role),
  );
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
  // Hesap tipi sekmesi. Yalnızca her firmayı gören ekranda anlamlı: firma
  // detayında ve portalda liste zaten tek tip (bayi) hesaplardan oluşuyor.
  const [family, setFamily] = useState<RoleFamily | "ALL">("ALL");
  const showFamilies = !fixedCompanyId;

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

  const all = query.data?.users ?? [];
  // Süzme sunucuda değil burada: liste zaten tek istekte geliyor ve sekme
  // değiştirmek yeni bir sorgu beklemeden çalışsın.
  const rows =
    family === "ALL" ? all : all.filter((u) => ROLE_FAMILY[u.role] === family);
  const countOf = (f: RoleFamily) =>
    all.filter((u) => ROLE_FAMILY[u.role] === f).length;

  return (
    <Panel
      title="Hesaplar"
      bodyClassName="p-0"
      action={
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? "Vazgeç" : "Yeni kullanıcı"}
        </Button>
      }
    >
      <div className="p-4 pb-0">
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

        {showFamilies && (
          <div className="mb-3">
            <Tabs
              value={family}
              onChange={setFamily}
              items={[
                { key: "ALL" as const, label: "Tümü", count: all.length },
                {
                  key: "SELLER" as const,
                  label: ROLE_FAMILY_LABELS.SELLER,
                  count: countOf("SELLER"),
                },
                {
                  key: "DEALER" as const,
                  label: ROLE_FAMILY_LABELS.DEALER,
                  count: countOf("DEALER"),
                },
                {
                  key: "FIELD" as const,
                  label: ROLE_FAMILY_LABELS.FIELD,
                  count: countOf("FIELD"),
                },
                {
                  key: "DELIVERY" as const,
                  label: ROLE_FAMILY_LABELS.DELIVERY,
                  count: countOf("DELIVERY"),
                },
              ]}
            />
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <TextInput
            value={search}
            placeholder="Ad veya e-posta ara"
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-64"
          />
          <Checkbox
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            label="Pasifleri de göster"
          />
        </div>

        {query.isLoading && <LoadingState />}
        <ErrorLine error={query.error} />
      </div>

      {query.data && (
        <Table>
          <THead>
            <tr>
              <Th>Ad</Th>
              <Th>E-posta</Th>
              <Th>Rol</Th>
              {!fixedCompanyId && <Th>Firma</Th>}
              <Th>Durum</Th>
              <Th align="right">İşlem</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((u) => (
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
            {rows.length === 0 && (
              <TableEmpty
                colSpan={fixedCompanyId ? 5 : 6}
                label="Bu süzgeçte kullanıcı yok."
              />
            )}
          </TBody>
        </Table>
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
  // atıldıktan sonra rol değişse bile küme ezilmez (bkz. changeRole).
  const [permissions, setPermissions] = useState<Permission[]>(() =>
    templateFor(initialRole, grantablePermissions),
  );
  const [touchedPermissions, setTouchedPermissions] = useState(false);

  const changeRole = (next: Role) => {
    setRole(next);
    if (!touchedPermissions) {
      setPermissions(templateFor(next, grantablePermissions));
      return;
    }
    // Elle seçim korunur, ama yeni hesap tipine verilemeyecek olanlar düşer:
    // aksi hâlde form sunucunun kesin reddedeceği bir küme gönderirdi.
    setPermissions((prev) =>
      prev.filter((p) => isPermissionGrantableTo(p, next)),
    );
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
    <div className="mb-4 rounded border border-line bg-sunken p-3">
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
          <Select
            value={role}
            onChange={(e) => changeRole(e.target.value as Role)}
          >
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
            <Select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
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
          <span className="ml-3 text-xs text-caution">
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
  const [permissions, setPermissions] = useState<Permission[]>(
    user.permissions,
  );
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
    mutationFn: () =>
      apiPost(`/api/admin/users/${user.id}/password`, { password }),
    onSuccess: () => setPassword(""),
  });

  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/users/${user.id}`),
    onSuccess: onChanged,
  });

  /**
   * Telefonunu ve yedek kodlarını birden kaybeden kullanıcının tek çıkışı.
   * Hesabı 2FA'sız bırakmaz: zorunlu kapsamdaysa bir sonraki girişinde
   * kurulum ekranına düşer — yani bu bir kaçış kapısı değil, yeni cihaz
   * kaydetme izni.
   */
  const resetTwoFactor = useMutation({
    mutationFn: () => apiDelete(`/api/admin/users/${user.id}/two-factor`),
    onSuccess: onChanged,
  });

  const error =
    patch.error ?? setPass.error ?? remove.error ?? resetTwoFactor.error;

  if (editing) {
    return (
      <tr>
        <Td colSpan={showCompany ? 6 : 5}>
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
                onChange={(e) => {
                  const next = e.target.value as Role;
                  setRole(next);
                  // Hesap tipi değişiyorsa (satıcı → bayi gibi) yeni tipe
                  // verilemeyen tikler düşer. Sunucu da aynısını yapıyor;
                  // burada düşmezse kullanıcı reddedilen bir kaydetme görürdü.
                  setPermissions((prev) =>
                    prev.filter((p) => isPermissionGrantableTo(p, next)),
                  );
                }}
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
                <p className="mt-1 text-xs text-ink-faint">
                  Kendi hesabınızı düzenliyorsunuz: kullanıcı yönetimi yetkisini
                  kaldıramazsınız, aksi hâlde geri açacak kimse kalmaz.
                </p>
              )}
            </div>
            <Button
              size="sm"
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing(false)}
            >
              Vazgeç
            </Button>
          </div>
          <ErrorLine error={error} />
        </Td>
      </tr>
    );
  }

  return (
    <tr className={user.isActive ? "" : "opacity-60"}>
      <Td className="font-medium text-ink">{user.name}</Td>
      <Td muted>{user.email}</Td>
      {/* Rol, hesap tipi ve iki sayı tek satıra diziliyordu ve sütun dar
          olduğu için "10" ile "yetki" ayrı satırlara düşüyordu. İki satır:
          üstte rolün kendisi, altında sayılar. */}
      <Td>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-ink">{ROLE_LABELS[user.role]}</span>
          {/* Hesap tipi: yetki kapsamını belirleyen şey rolün kendisi değil
              ailesi, o yüzden listede de görünüyor. */}
          <Badge tone="neutral">
            {ROLE_FAMILY_LABELS[ROLE_FAMILY[user.role]]}
          </Badge>
        </span>
        {/* Rol artık yetkiyi anlatmadığı için sayısı da yazılıyor: aynı roldeki
            iki hesabın farklı yetkileri olabilir. */}
        <span className="mt-1 block whitespace-nowrap text-xs text-ink-faint">
          <span
            title={
              user.permissions.length > 0
                ? user.permissions.map((p) => PERMISSION_LABELS[p]).join("\n")
                : "Hiç yetki yok"
            }
          >
            {user.permissions.length} yetki
          </span>
          {user.managedCompanyCount > 0 &&
            ` · ${user.managedCompanyCount} firma`}
        </span>
      </Td>
      {showCompany && <Td muted>{user.company?.name ?? "—"}</Td>}
      <Td>
        {user.isActive ? (
          <Badge tone="success">Aktif</Badge>
        ) : (
          <Badge tone="neutral">Pasif</Badge>
        )}
      </Td>
      <Td>
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            Düzenle
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isSelf || patch.isPending}
            title={isSelf ? "Kendi hesabınızı pasife alamazsınız" : undefined}
            onClick={() => patch.mutate({ isActive: !user.isActive })}
          >
            {user.isActive ? "Pasife al" : "Aktifleştir"}
          </Button>
          {user.twoFactorEnabled && (
            <Button
              size="sm"
              variant="ghost"
              disabled={resetTwoFactor.isPending}
              title="Kullanıcı telefonunu ve yedek kodlarını kaybettiyse"
              onClick={() => {
                if (
                  confirm(
                    `${user.name} hesabının iki adımlı doğrulaması sıfırlansın mı? ` +
                      `Açık oturumları kapanır ve yeniden kurmak zorunda kalır.`,
                  )
                ) {
                  resetTwoFactor.mutate();
                }
              }}
            >
              2FA sıfırla
            </Button>
          )}
          {/* Elli satırlık bir listede `dangerQuiet` sağ kenarda kırmızı bir
              sütuna dönüşüyor (stok partilerindeki ile aynı sebep); yıkıcılığı
              taşıyan şey zaten onay penceresi. */}
          <Button
            size="sm"
            variant="ghost"
            disabled={isSelf || remove.isPending}
            onClick={() => {
              if (
                confirm(
                  `${user.name} silinsin mi? İşlem geçmişi varsa silinemez.`,
                )
              ) {
                remove.mutate();
              }
            }}
          >
            Sil
          </Button>
        </div>
        <ErrorLine error={error} />
      </Td>
    </tr>
  );
}
