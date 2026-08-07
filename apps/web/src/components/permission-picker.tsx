"use client";

import {
  PERMISSION_GROUPS,
  PERMISSION_HINTS,
  PERMISSION_LABELS,
  defaultPermissionsFor,
  type Permission,
  type Role,
} from "@repo/types";
import { Button } from "@/components/form";
import { cn } from "@/lib/utils";

/**
 * Yetkilerin tek tek seçildiği onay kutusu ızgarası.
 *
 * Rol bir *şablon*: "Rol şablonunu uygula" düğmesi tikleri o rolün varsayılanına
 * çeker, sonrası elle. Rol değişince tikleri kendiliğinden ezmiyoruz — bilinçli
 * bir ayar (ör. "plasiyer ama kasa kapalı") sessizce geri alınmasın.
 *
 * `grantable` çağıranın kendi izin kümesi: kendinde olmayan bir izin burada
 * kilitli görünür. Sunucu aynı kuralı yeniden uyguluyor (assertMayGrant); bu
 * yalnızca reddedilecek bir isteği yazmaktan kurtarır.
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
  /** Şablon düğmesinin kaynağı. */
  role: Role;
  grantable: readonly Permission[];
  disabled?: boolean;
}) {
  const selected = new Set(value);
  const allowed = new Set(grantable);

  const toggle = (perm: Permission) => {
    const next = new Set(selected);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    onChange([...next]);
  };

  const applyTemplate = () => {
    // Şablonun çağıranda olmayan izinleri düşer — aksi hâlde form sunucunun
    // kesin olarak reddedeceği bir küme üretirdi.
    onChange(defaultPermissionsFor(role).filter((p) => allowed.has(p)));
  };

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
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" disabled={disabled} onClick={applyTemplate}>
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
          // Çağıranın hiç veremediği grup gösterilmez; kilitli bir liste
          // "burada bir şey var ama sana kapalı"dan başka bir şey söylemez.
          const visible = group.permissions.filter((p) => allowed.has(p));
          if (visible.length === 0) return null;
          const groupSelected = visible.filter((p) => selected.has(p)).length;

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
                    if (groupSelected === visible.length) {
                      visible.forEach((p) => next.delete(p));
                    } else {
                      visible.forEach((p) => next.add(p));
                    }
                    onChange([...next]);
                  }}
                >
                  {groupSelected === visible.length ? "kaldır" : "tümü"}
                </button>
              </legend>

              <div className="space-y-1">
                {visible.map((perm) => {
                  const hint = PERMISSION_HINTS[perm];
                  return (
                    <label
                      key={perm}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm",
                        "hover:bg-neutral-50 dark:hover:bg-neutral-800/60",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-500/30 dark:border-neutral-600"
                        checked={selected.has(perm)}
                        disabled={disabled}
                        onChange={() => toggle(perm)}
                      />
                      <span className="min-w-0">
                        <span className="block text-neutral-800 dark:text-neutral-200">
                          {PERMISSION_LABELS[perm]}
                        </span>
                        {hint && (
                          <span className="block text-[11px] leading-snug text-neutral-500">
                            {hint}
                          </span>
                        )}
                      </span>
                    </label>
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
