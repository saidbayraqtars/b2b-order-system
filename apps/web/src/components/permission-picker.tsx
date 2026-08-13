"use client";

import {
  isPermissionGrantableTo,
  PERMISSION_GROUPS,
  PERMISSION_HINTS,
  PERMISSION_LABELS,
  ROLE_FAMILY,
  ROLE_FAMILY_LABELS,
  defaultPermissionsFor,
  type Permission,
  type Role,
} from "@repo/types";
import { Button, Checkbox } from "@/components/form";

/**
 * Yetkilerin tek tek seçildiği onay kutusu ızgarası.
 *
 * Rol bir *şablon*: "Rol şablonunu uygula" düğmesi tikleri o rolün varsayılanına
 * çeker, sonrası elle. Rol değişince tikleri kendiliğinden ezmiyoruz — bilinçli
 * bir ayar (ör. "plasiyer ama kasa kapalı") sessizce geri alınmasın.
 *
 * İki ayrı kısıt var ve ekranda ayrı görünürler:
 *
 *  - **Kapsam** (`role`): izin bu hesap tipine verilebilir mi? Verilemeyen kutu
 *    **pasif** durur ve nedenini söyler — bayi hesabı açan kişi satıcı
 *    yetkilerinin var olduğunu görür ama seçemez. Gizlemek yerine pasif
 *    göstermek bilinçli: "burada bir şey yok" ile "burası sana kapalı" farklı.
 *  - **Devir sınırı** (`grantable`): çağıranın kendi kümesi. Kendisinde olmayan
 *    izin hiç gösterilmez, çünkü onun için "bu hesap tipine kapalı" demek yanlış
 *    olurdu — kapalı olan şey çağıranın yetkisi.
 *
 * Sunucu ikisini de yeniden uygular (`assertMayGrant`); bu yalnızca reddedilecek
 * bir isteği yazmaktan kurtarır.
 */
export function PermissionPicker({
  value,
  onChange,
  role,
  grantable,
  disabled = false,
}: {
  value: readonly Permission[];
  onChange: (next: Permission[]) => void;
  /** Hedef hesabın rolü: hem şablonun hem kapsamın kaynağı. */
  role: Role;
  grantable: readonly Permission[];
  disabled?: boolean;
}) {
  const selected = new Set(value);
  const own = new Set(grantable);
  const familyLabel = ROLE_FAMILY_LABELS[ROLE_FAMILY[role]];
  const inScope = (perm: Permission) => isPermissionGrantableTo(perm, role);
  const usable = (perm: Permission) => own.has(perm) && inScope(perm);

  const toggle = (perm: Permission) => {
    const next = new Set(selected);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    onChange([...next]);
  };

  const applyTemplate = () => {
    // Şablon zaten rolün kendi şablonu, ama çağıranda olmayan izinleri düşer —
    // aksi hâlde form sunucunun kesin olarak reddedeceği bir küme üretirdi.
    onChange(defaultPermissionsFor(role).filter(usable));
  };

  const blockedCount = [...own].filter((p) => !inScope(p)).length;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div>
          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Yetkiler
            <span className="ml-2 font-normal text-neutral-400">
              {selected.size} seçili
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Rol yalnızca hangi bölüme girileceğini belirler; ne yapılabileceğini
            bu tikler belirler.
            {blockedCount > 0 && (
              <>
                {" "}
                <span className="text-neutral-400">
                  {blockedCount} yetki {familyLabel.toLowerCase()} hesabına
                  verilemediği için pasif.
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={applyTemplate}
          >
            Rol şablonunu uygula
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || selected.size === 0}
            onClick={() => onChange([])}
          >
            Temizle
          </Button>
        </div>
      </header>

      <div className="grid gap-x-6 gap-y-3 p-3 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => {
          // Çağıranın hiç veremediği izin gösterilmez; kalanlar arasında kapsam
          // dışı olanlar pasif durur.
          const visible = group.permissions.filter((p) => own.has(p));
          if (visible.length === 0) return null;
          const selectable = visible.filter(inScope);
          if (selectable.length === 0) {
            // Grubun tamamı bu hesap tipine kapalı (bayide "Sistem" gibi):
            // 15 pasif satır basmak yerine tek satır yazıyoruz.
            return (
              <fieldset key={group.title} className="min-w-0 opacity-60">
                <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  {group.title}
                </legend>
                <p className="text-xs text-neutral-500">
                  Bu bölümün yetkileri {familyLabel.toLowerCase()} hesabına
                  verilemez.
                </p>
              </fieldset>
            );
          }
          const groupSelected = selectable.filter((p) =>
            selected.has(p),
          ).length;

          return (
            <fieldset key={group.title} className="min-w-0">
              <legend className="mb-1 flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                <span>{group.title}</span>
                <button
                  type="button"
                  disabled={disabled}
                  className="font-medium normal-case tracking-normal text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
                  onClick={() => {
                    const next = new Set(selected);
                    // Grubun tamamı seçiliyse düğme "kaldır" gibi davranır.
                    // Yalnızca seçilebilir olanlara dokunur.
                    if (groupSelected === selectable.length) {
                      selectable.forEach((p) => next.delete(p));
                    } else {
                      selectable.forEach((p) => next.add(p));
                    }
                    onChange([...next]);
                  }}
                >
                  {groupSelected === selectable.length ? "kaldır" : "tümü"}
                </button>
              </legend>

              <div className="space-y-1">
                {visible.map((perm) => {
                  const hint = PERMISSION_HINTS[perm];
                  const blocked = !inScope(perm);
                  return (
                    <Checkbox
                      key={perm}
                      checked={selected.has(perm) && !blocked}
                      disabled={disabled || blocked}
                      onChange={() => toggle(perm)}
                      label={
                        <>
                          <span className="min-w-0">
                            <span className="block text-neutral-800 dark:text-neutral-200">
                              {PERMISSION_LABELS[perm]}
                            </span>
                            {blocked ? (
                              <span className="block text-[11px] leading-snug text-neutral-500">
                                {familyLabel} hesabına verilemez
                              </span>
                            ) : (
                              hint && (
                                <span className="block text-[11px] leading-snug text-neutral-500">
                                  {hint}
                                </span>
                              )
                            )}
                          </span>
                        </>
                      }
                    />
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
