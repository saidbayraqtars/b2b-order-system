"use client";

import { useEffect } from "react";
import type {
  ReactNode,
  SelectHTMLAttributes,
  InputHTMLAttributes,
} from "react";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Ekranların paylaştığı form/panel bileşenleri. Plan büyük bir bileşen
// kütüphanesi değil — düz Tailwind, ama tek noktadan: köşe yarıçapı, kenar
// çizgisi ve odak davranışı burada değişince 60 ekrana birden yansır.

const CONTROL = cn(
  "w-full rounded border border-line bg-panel text-ink",
  "placeholder:text-ink-faint outline-none transition-colors",
  // Odakta renk patlaması yok: kenar koyulaşır, ince bir halka eklenir.
  "hover:border-line-strong focus:border-ink-muted focus:ring-1 focus:ring-ink-muted",
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-faint",
);

/**
 * Kontrol boyu.
 *
 * `sm`, rapor tasarımcısı gibi tek satıra beş kontrol dizen yoğun ekranlar için:
 * orada her kontrolü 40 piksele çıkarmak satırı sarmalıyor. Ekranlar bu boyu
 * kendi sınıflarını yazarak elde ediyordu ve üç ayrı yükseklik ortaya çıkmıştı
 * (`h-7`, `h-8`, `h-9`) — ikisi seçildi, gerisi gitti.
 */
const CONTROL_SIZE = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-10 px-3 text-body-sm",
} as const;

export type ControlSize = keyof typeof CONTROL_SIZE;

export function Label({
  children,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  hint?: string;
  /** Verilirse gerçek bir label/for bağı üretir — ekran okuyucu input'a bağlar. */
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-medium text-ink-muted"
    >
      {children}
      {hint ? (
        <span className="ml-1 font-normal text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({
  size = "md",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: ControlSize;
}) {
  return (
    <input
      {...props}
      className={cn(CONTROL, CONTROL_SIZE[size], props.className)}
    />
  );
}

export function Select({
  size = "md",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: ControlSize;
}) {
  return (
    <select
      {...props}
      className={cn(CONTROL, CONTROL_SIZE[size], props.className)}
    />
  );
}

/**
 * Çoklu seçim kutusu — kampanya kuralının "şu kategorilerde" alanı gibi.
 *
 * `Select`ten ayrı duruyor çünkü yüksekliği satır sayısından geliyor, `h-10`dan
 * değil: `CONTROL_SIZE` uygulanırsa liste tek satıra iniyor. Kaç satır
 * görüneceğini seçeneklerin sayısı belirliyor (en az 3, en çok 6) — üç ürünlük
 * bir listeye altı satır ayırmak da, iki yüz ürünü üç satırdan seçtirmek de
 * aynı ölçüde işe yaramaz.
 */
export function MultiSelect({
  value,
  onChange,
  options,
  className,
  ...props
}: Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange" | "multiple" | "size"
> & {
  value: readonly string[];
  onChange: (next: string[]) => void;
  options: ReadonlyArray<{ id: string; name: string }>;
}) {
  return (
    <select
      {...props}
      multiple
      size={Math.min(6, Math.max(3, options.length))}
      value={value as string[]}
      onChange={(e) =>
        onChange(
          [...e.target.selectedOptions].map((o) => o.value).filter(Boolean),
        )
      }
      className={cn(CONTROL, "p-1 text-body-sm", className)}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cn(
        CONTROL,
        "min-h-20 px-3 py-2 text-body-sm",
        props.className,
      )}
    />
  );
}

/**
 * Onay kutusu.
 *
 * 19 ekranda ham `input type=checkbox` olarak duruyordu: kimi etiketiyle
 * `label` içindeydi, kimi yanındaki metne hiç bağlı değildi (yani metne
 * tıklamak işe yaramıyordu), hiçbirinde odak halkası yoktu. Yerli kutu
 * korunuyor — erişilebilirliği ve klavye davranışı bedava — yalnızca rengi,
 * odak halkası ve etikete bağlanması tek yerde.
 */
export function Checkbox({
  label,
  hint,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  hint?: string;
}) {
  const box = (
    <input
      {...props}
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded-sm border-line-strong accent-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-strong",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );

  // Etiketsiz kullanım (tablo başlığındaki "hepsini seç" gibi) hâlâ mümkün.
  if (label === undefined) return box;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-body-sm text-ink-muted",
        props.disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {box}
      <span>
        {label}
        {hint ? (
          <span className="ml-1 text-xs text-ink-faint">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

const BUTTON_VARIANT = {
  primary: "bg-accent text-on-accent hover:opacity-90 active:opacity-80",
  secondary:
    "border border-line bg-panel text-ink-muted hover:bg-subtle hover:border-line-strong hover:text-ink",
  danger: "bg-critical text-white hover:opacity-90 active:opacity-80",
  // Listedeki "Sil" için. Dolu kırmızı bir düğme, satırın *asıl* eylemi olan
  // "Düzenle"den daha çok bakılıyor ve dört satırlık bir ayar ekranını kırmızı
  // bir duvara çeviriyordu. Yıkıcılık kaybolmuyor, yalnızca üzerine gelene
  // kadar sesini yükseltmiyor — onay penceresi ağırlığı zaten taşıyor.
  dangerQuiet:
    "border border-transparent text-critical hover:border-critical/30 hover:bg-critical/10",
  success: "bg-positive text-white hover:opacity-90 active:opacity-80",
  ghost: "text-ink-faint hover:bg-subtle hover:text-ink",
} as const;

const BUTTON_SIZE = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-body-sm",
} as const;

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANT;
  size?: keyof typeof BUTTON_SIZE;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded font-medium transition-all",
        "disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        props.className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * Düğme gibi görünen bağlantı.
 *
 * "Kargo etiketi", "yol tarifi", "yeni rapor" gibi yerlerde gerçekten gezinme
 * var — bir düğmeye router.push bağlamak yeni sekmede açmayı, orta tıklamayı ve
 * bağlantı adresini görmeyi bozardı. Bu yüzden eleman bağlantı kalıyor, yalnızca
 * görünümü `Button`la ortak.
 */
export function LinkButton({
  variant = "secondary",
  size = "sm",
  className,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: keyof typeof BUTTON_VARIANT;
  size?: keyof typeof BUTTON_SIZE;
}) {
  return (
    <a
      {...props}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded font-medium transition-all",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
    >
      {children}
    </a>
  );
}

export function Panel({
  title,
  icon,
  action,
  children,
  className,
  /** Gövde dolgusunu kaldırmak için ("p-0") — kenardan kenara liste/tablo. */
  bodyClassName,
}: {
  title: string;
  /** Başlığın solunda küçük bir ikon — panelin ne olduğunu bir bakışta söyler. */
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-line bg-panel",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-headline-sm text-ink">
          {icon && <span className="shrink-0 text-ink-faint">{icon}</span>}
          <span className="truncate">{title}</span>
        </h2>
        {action}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Ortada açılan pencere.
 *
 * Escape kapatıyor ve arka plana tıklamak kapatıyor — ikisi de her yerde
 * beklenen davranış ve her ekranın kendi başına yazması gereken şeyler değil.
 * İçerik `form` olabilsin diye `children` serbest bırakılıyor; pencere yalnızca
 * kabuk.
 */
export function Modal({
  title,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // Yalnızca zemine tıklanınca kapanıyor: içerideki bir sürükleme hareketi
      // dışarıda bitince pencere kapanmasın.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full rounded-lg border border-line bg-panel shadow-pop",
          width,
        )}
      >
        <h2 className="border-b border-line px-4 py-3 text-headline-sm text-ink">
          {title}
        </h2>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * Uyarı satırı — hata değil ama sonucu değiştiren bir koşul: "tarama sınırına
 * ulaşıldı", "bu kart çalışmadı", "geçici şifreniz süresini doldurmak üzere".
 *
 * `ErrorLine`ın kardeşi ve aynı ölçülerde: dört ekran bu kutuyu kendi yazmıştı
 * (giriş, şifre sıfırlama, çek tahtası, pano) ve ikisi kehribarı ham
 * `amber-*` sınıflarıyla, ikisi anlamsal `caution` ile çizmişti — aynı cümlenin
 * iki görüntüsü. Kırmızı "işlem olmadı" der, kehribar "oldu ama şunu bilin".
 */
export function WarnLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded border border-caution/30 bg-caution/10 px-3 py-2 text-body-sm text-caution",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}

/** Başarısız bir işlemin satır içi hata satırı. */
export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="mt-2 flex items-start gap-2 rounded border border-critical/30 bg-critical/10 px-3 py-2 text-body-sm text-critical">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Beklenmeyen bir hata oluştu"}
    </p>
  );
}
