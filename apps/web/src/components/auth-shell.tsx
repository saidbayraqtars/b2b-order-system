import type { ReactNode } from "react";
import Link from "next/link";
import { AuthStage } from "@/components/auth-stage";
import { tenantBrand } from "@/lib/tenant-brand";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Oturum açılmadan görülen üç ekranın ortak kabuğu: giriş, bayi başvurusu ve
 * şifre sıfırlama.
 *
 * `SidebarShell` burada kullanılamaz — kenar çubuğu bir gezinme aracı ve
 * gezinecek bir yeri olmayan ziyaretçiye boş bir menü göstermek anlamsız. Ama
 * kural aynı kalıyor: bu üç ekranın da tek bir kabuğu var, üçü de aynı yerde
 * aynı şeyi gösteriyor. İkisi ayrı ayrı yazıldığında (öncesinde öyleydi) biri
 * `max-w-sm` ortalanmış bir kutu, diğeri sola dayalı bir sütundu.
 *
 * Sol sütun `lg`den küçük ekranlarda hiç çizilmiyor: telefonda 400 piksellik
 * bir alanı dekora ayırmak, formu ekranın dışına iter.
 */
export async function AuthShell({
  /** Verilmezse kiracının adı; bu bir sunucu bileşeni, doğrudan okuyabiliyor. */
  brand,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  brand?: string;
  /** Başlığın üstündeki küçük büyük-harf etiket: "Giriş", "Bayi başvurusu". */
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Kartın altındaki bağlantı satırı. */
  footer?: ReactNode;
}) {
  const name = brand ?? (await tenantBrand());

  return (
    <div className="flex min-h-screen bg-surface">
      <AuthStage brand={name} />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 px-6 pt-6 md:px-10">
          {/* Marka yalnızca sahne çizilmediğinde: iki yerde birden yazınca
              ekranın üstünde aynı ad iki kez duruyordu. */}
          <Link href="/" className="flex items-center gap-2.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded border border-line bg-panel text-xs font-bold text-ink">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-body-sm font-semibold text-ink">{name}</span>
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 md:px-10">
          <div className="w-full max-w-[420px]">
            <div className="animate-fade-up">
              <p className="tech-label">{eyebrow}</p>
              <h1 className="mt-2 text-headline-lg text-ink">{title}</h1>
              {subtitle && (
                <p className="mt-2 text-body-sm text-ink-muted">{subtitle}</p>
              )}
            </div>

            <div
              className="relative mt-6 overflow-hidden rounded-lg border border-line bg-panel p-6 animate-fade-up"
              style={{ animationDelay: "0.1s" }}
            >
              {/* Kartın üstünde soldan sağa uzayan saç teli. Gölge yerine
                  çizgi: yüzeyi ayıran şey bu tasarımda her zaman 1 piksel. */}
              <span className="absolute inset-x-0 top-0 h-px origin-left animate-hairline bg-ink-muted" />
              {children}
            </div>

            {footer && (
              <div
                className="mt-5 animate-fade-up text-center text-body-sm text-ink-muted"
                style={{ animationDelay: "0.2s" }}
              >
                {footer}
              </div>
            )}
          </div>
        </div>

        <footer className="px-6 pb-6 text-center text-xs text-ink-faint md:px-10">
          {name} · Sipariş &amp; Yönetim Sistemi
        </footer>
      </main>
    </div>
  );
}
