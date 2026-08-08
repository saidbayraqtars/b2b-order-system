import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { resolveTheme } from "@repo/theme";
import { themeSettings } from "@repo/services";
import { ThemeScope } from "@/components/theme-scope";
import { PACK_COOKIE, SCHEME_COOKIE } from "@/lib/theme-pack";

/**
 * Vitrinin tasarım kapsamı.
 *
 * Paket burada, sunucuda seçiliyor. Sebep tek kelime: parlama. Seçimi tarayıcıda
 * çözseydik ilk boyama varsayılan kimlikle yapılır, sonra doğrusuna atlardı —
 * müşterinin karşısında en görünür yerde.
 *
 * Öncelik sırası: ziyaretçinin çerezi > kurulumun `tenant.json` tercihi >
 * paketin kendi varsayılanı. Yani müşteri kendi kimliğiyle açar, sunumu yapan
 * kişi anahtarla değiştirir, o değişiklik yalnızca kendi tarayıcısında kalır.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const settings = await themeSettings();
  const jar = cookies();

  const { pack, scheme } = resolveTheme(
    jar.get(PACK_COOKIE)?.value ?? settings.pack,
    jar.get(SCHEME_COOKIE)?.value ?? settings.scheme ?? null,
  );

  return (
    <ThemeScope
      initialPack={pack.id}
      initialScheme={scheme}
      switcher={settings.switcher}
    >
      {children}
    </ThemeScope>
  );
}
