import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";

// Paylaşılan yüzeyler. Kural basit: yüzeyler gölgeyle değil 1px çizgiyle
// ayrılır, renk yalnızca durum bildirir, ölçüler tailwind.config'teki ölçekten
// gelir. Ekranlar kendi kart/tablo sınıflarını yazmaz.

/** Genel kart yüzeyi — Panel'in başlıksız, tek kullanımlık hali. */
export function Card({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  /** Fare üzerine geldiğinde hafif yükselsin mi — tıklanabilir kartlar için. */
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-panel p-4",
        hover && "transition-shadow hover:shadow-card-hover",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Sayı kutusu: küçük büyük-harf etiket, altında büyük rakam, altında değişim.
 *
 * Yönetim ve portal panolarının yarısı bu kutudan oluşuyor ve her ekran kendi
 * yazı boyunu seçiyordu — üç ayrı "önemli sayı" görüntüsü çıkmıştı.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  /** Rakamın altındaki tek satır: "geçen aya göre +%4,2" gibi. */
  hint?: ReactNode;
  tone?: "neutral" | "positive" | "caution" | "critical";
  icon?: ReactNode;
}) {
  const hintTone = {
    neutral: "text-ink-faint",
    positive: "text-positive",
    caution: "text-caution",
    critical: "text-critical",
  }[tone];

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="tech-label">{label}</span>
        {icon && <span className="shrink-0 text-ink-faint">{icon}</span>}
      </div>
      {/* `overflow-wrap: anywhere`: altı kutuluk bir şeritte 32 punto
          "₺1.583.469,27" kutuyu taşırıyor ve rakamlar kenardan kesiliyordu
          (alacak yaşlandırma ekranında görüldü). Kesmek yerine sarmalıyor —
          para bir kutuya sığmadı diye basamak kaybedemez. */}
      <div className="text-headline-lg tabular-nums text-ink [overflow-wrap:anywhere]">
        {value}
      </div>
      {hint && <div className={cn("mt-1 text-xs", hintTone)}>{hint}</div>}
    </div>
  );
}

const METER_TONE = {
  neutral: "bg-accent",
  positive: "bg-positive",
  caution: "bg-caution",
  critical: "bg-critical",
} as const;

/**
 * Doluluk çubuğu — hedefin yüzdesi, kurulumun kaçta kaçı.
 *
 * Üç ekran bunu kendi yazıyordu ve üçü de farklı bir renk seçmişti (mavi,
 * marka, zümrüt). Renk burada süs değil işaret: varsayılan mürekkep, kırmızı
 * "geride", yeşil "tamam". Yükseklik ve yarıçap tek yerde.
 */
export function Meter({
  value,
  tone = "neutral",
  label,
}: {
  /** 0–100. Dışarı taşan değerler kırpılır: %140 çubuğu taşırmaz. */
  value: number;
  tone?: keyof typeof METER_TONE;
  /** Ekran okuyucu için — çubuk görsel, sayı metinde başka yerde duruyor. */
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-sm bg-subtle"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full transition-all", METER_TONE[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Künye alanı: küçük büyük-harf etiket, altında değer.
 *
 * Kuruluş bilgileri, saklama sayıları ve iş kartları üçü de aynı şeyi ayrı ayrı
 * yazmıştı — biri `text-xs uppercase`, biri `text-xs`, biri hiç etiketlememiş.
 */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="tech-label">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-body-sm text-ink">
        {children}
      </dd>
    </div>
  );
}

/**
 * Künye satırı: solda etiket, sağda değer, altında ayraç.
 *
 * `Field`ten farkı yön: burada okunan şey satırın *sağ* ucu ve alt alta gelen
 * değerler bir kolon oluşturuyor. Sürüm ekranı ile bakım işleri kartı bunu iki
 * ayrı biçimde yazmıştı.
 */
export function DefRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2 last:border-0">
      <span className="text-body-sm text-ink-muted">{label}</span>
      <span className="text-body-sm font-medium tabular-nums text-ink">
        {children}
      </span>
    </div>
  );
}

const BADGE_TONE = {
  neutral: "border-line bg-sunken text-ink-muted",
  brand: "border-accent bg-accent text-on-accent",
  success: "border-positive/30 bg-positive/10 text-positive",
  warning: "border-caution/30 bg-caution/10 text-caution",
  danger: "border-critical/30 bg-critical/10 text-critical",
  info: "border-line-strong bg-subtle text-ink-muted",
} as const;

export type BadgeTone = keyof typeof BADGE_TONE;

/** Durum işareti. Küçük, büyük harf, dikdörtgen — rozet değil künye. */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        BADGE_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Sayfa üstü başlık bloğu — h1 + alt metin + sağda opsiyonel aksiyon/geri linki. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {back.label}
          </Link>
        )}
        <h1 className="text-headline-lg text-ink">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-body-sm text-ink-muted">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

/**
 * Ekranın altındaki kural açıklaması — "bu defter neyi takip eder", "bir vade
 * tanımını değiştirmek geçmiş siparişi bozar mı" gibi metinler.
 *
 * Sekiz yönetim ekranı bunu kendi yazıyordu (`text-sm text-neutral-500`) ve üçü
 * farklı puntoya oturmuştu. Blok kenar çizgisiyle ayrılıyor, kutuya
 * konmuyor: okunması **gereken** bir uyarı değil, isteyenin okuyacağı bir
 * dipnot — kutu ona hak etmediği bir ağırlık verirdi.
 */
export function Note({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "mt-8 border-l-2 border-line-strong pl-4 text-body-sm leading-relaxed text-ink-muted",
        "[&_strong]:font-semibold [&_strong]:text-ink",
        // Dipnotların yarısı bir dosya adı ya da bir komut söylüyor. Kutu iki
        // ekranda elle yazılmıştı, gerisinde çıplak duruyordu — aynı cümlenin
        // iki görüntüsü.
        "[&_code]:rounded [&_code]:bg-sunken [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-ink",
        className,
      )}
    >
      {children}
    </aside>
  );
}

/** Tam ekran değil, panel-içi bekleme durumu — "Yükleniyor…" düz metninin yerine. */
export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-6 text-body-sm text-ink-faint">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </p>
  );
}

/** Boş liste/tablo durumu — ikon + mesaj, sade ama "unutulmuş ekran" hissi vermez. */
export function EmptyState({
  label,
  action,
}: {
  label: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-body-sm text-ink-faint">
      <PackageSearch className="h-6 w-6" />
      {label}
      {action}
    </div>
  );
}

/**
 * Sekme şeridi.
 *
 * İki ekranda iki farklı renkle yazılmıştı (biri indigo, biri marka rengi) —
 * aynı arayüzde iki "seçili sekme" görüntüsü, ekranların ayrı ayrı yazıldığını
 * ele veren türden bir tutarsızlık.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (next: T) => void;
  items: ReadonlyArray<{ key: T; label: string; count?: number }>;
}) {
  return (
    <nav className="flex flex-wrap gap-4 border-b border-line">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          aria-current={value === item.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 pb-2.5 pt-1 text-body-sm font-medium transition-colors",
            value === item.key
              ? "border-accent text-ink"
              : "border-transparent text-ink-faint hover:text-ink",
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="ml-1.5 tabular-nums text-xs text-ink-faint">
              {item.count}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

/**
 * Filtre şeridi: yan yana duran, seçileni siyah dolan küçük düğmeler.
 *
 * Sekmeden farkı, bunun bir *daraltma* olması — "Tümü / Süt Ürünleri /
 * Şarküteri". Sayfayı değiştirmez, listeyi kısar. Ayrı bir görüntü hak ediyor.
 */
const CHIP =
  "shrink-0 whitespace-nowrap rounded border px-3 py-1.5 text-xs font-medium transition-colors";
const CHIP_ON = "border-accent bg-accent text-on-accent";
const CHIP_OFF = "border-line bg-panel text-ink-muted hover:bg-subtle";

export function Chips<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  items: ReadonlyArray<{ key: T; label: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-1", className)}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          aria-pressed={value === item.key}
          className={cn(CHIP, value === item.key ? CHIP_ON : CHIP_OFF)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * `Chips`in çoklu seçim hâli: hedef müşteri grupları gibi "hiçbiri, biri ya da
 * hepsi" seçimleri için. Görüntü birebir aynı — aynı ekranda iki farklı "seçili
 * küçük düğme" görüntüsü olmasın diye sınıflar paylaşılıyor. Ayrı bileşen
 * olmasının sebebi anlam: burada seçim bir *küme*, sarmalanabilsin diye şerit de
 * kaydırmıyor.
 */
export function MultiChips<T extends string>({
  value,
  onChange,
  items,
}: {
  value: readonly T[];
  onChange: (next: T[]) => void;
  items: ReadonlyArray<{ key: T; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = value.includes(item.key);
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                on ? value.filter((v) => v !== item.key) : [...value, item.key],
              )
            }
            className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// TABLO
// ─────────────────────────────────────────────
//
// Yönetim panelinin yarısı tablo ve her ekran kendi başlık/hücre sınıflarını
// yazıyordu: aynı tablo bir ekranda "text-sm", diğerinde "text-xs", birinde
// koyu tema satır ayracı var, diğerinde yok. Aşağıdakiler bileşen kütüphanesi
// değil — tablo elemanının kendisi yerinde duruyor, yalnızca sınıflar tek yerde.

/**
 * Yatay kaydırma kabuğu + tablo. Dar ekranda sayfayı değil tabloyu kaydırır.
 *
 * `stickyHead`: uzun listelerde başlık satırı sayfanın üstüne yapışır. Üç
 * yönetim tablosu üç bin pikseli aşıyor (güvenlik kaydı 3530, kategoriler 3648,
 * kullanıcılar 3567) ve sayfanın ortasında bir rakam sütununa bakarken hangi
 * sütun olduğunu söyleyen hiçbir şey yoktu.
 *
 * İki ayrıntı, ikisi de denemeden görünmüyor:
 *
 *  1. **`THead`e tek satır `sticky` eklemek işe yaramıyor.** Sarmalayıcının
 *     `overflow-x: auto`su diğer ekseni de `auto`ya çeviriyor (CSS kuralı) ve
 *     yapışkan öğe artık sayfaya değil o kutuya tutunuyor; kutunun yüksekliği
 *     sınırsız olduğu için de hiç kaydırılmıyor, yani başlık hiç yapışmıyor.
 *     Bu yüzden `stickyHead` verildiğinde sarmalayıcı `sm`den itibaren
 *     kaydırmayı bırakıyor. Dar ekranda kaydırma kalıyor — orada zaten sayfa
 *     kaydırılıyor ve yapışkan başlık ekranın yarısını yerdi.
 *  2. **`top-16`, `top-0` değil.** Kabuğun üst şeridi 64 piksel ve o da
 *     yapışkan; sıfırda başlık şeridin altına kayıyor.
 *
 * Bu yüzden bayrak isteğe bağlı: sekiz sayı sütunlu geniş tablolar (alacak
 * yaşlandırma) kaydırma kabuğunu koruyor.
 */
export function Table({
  children,
  className,
  stickyHead = false,
}: {
  children: ReactNode;
  className?: string;
  stickyHead?: boolean;
}) {
  return (
    <div
      className={cn(
        "-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0",
        stickyHead && "sm:overflow-x-visible",
      )}
    >
      <table
        className={cn(
          "w-full text-left text-body-sm",
          stickyHead && "sm:[&_thead]:sticky sm:[&_thead]:top-16 sm:[&_thead]:z-10",
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

/** Başlık satırı: gömük zemin, küçük büyük-harf etiketler. */
export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-y border-line bg-sunken text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

type CellAlign = "left" | "right" | "center";

const ALIGN: Record<CellAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: CellAlign;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-2.5 font-semibold",
        ALIGN[align],
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  /** Sayı sütunu: eşit genişlikli rakamlar, aksi hâlde tutarlar zıplıyor. */
  numeric = false,
  muted = false,
  className,
  colSpan,
}: {
  children?: ReactNode;
  align?: CellAlign;
  numeric?: boolean;
  muted?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-4 py-3",
        ALIGN[align],
        numeric && "tabular-nums",
        muted && "text-xs text-ink-faint",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Tablo içi boş durum — `EmptyState`'in tek hücreye sığan hâli. */
export function TableEmpty({
  colSpan,
  label,
  action,
}: {
  colSpan: number;
  label: string;
  /** Bir sonraki adım — `EmptyState`teki yuvanın tablo içindeki karşılığı. */
  action?: ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-10 text-center text-body-sm text-ink-faint"
      >
        <div className="flex flex-col items-center gap-3">
          {label}
          {action}
        </div>
      </td>
    </tr>
  );
}
