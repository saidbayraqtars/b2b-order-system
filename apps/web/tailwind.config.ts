import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

/**
 * Tasarım dili: "Executive Precision" (docs/design/stitch-v2).
 *
 * Tek renk ailesi var ve o da gri. Kurumsal arayüzde renk bir süs değil bir
 * işaret: yeşil "stokta", kırmızı "borç", siyah "birincil eylem". Geri kalan
 * her şey nötr kalınca göz doğrudan veriye gidiyor — bu ekranların yarısı
 * tablo, tablonun rengi olmaz.
 *
 * İki katman var:
 *  1. `neutral` / `brand` merdivenleri — henüz elden geçmemiş ekranlar bunları
 *     kullanıyor. Değerleri değiştirdik, sınıf adları aynı kaldı: 1150 satır
 *     dokunmadan yeni tona geçti.
 *  2. Anlamsal isimler (`surface`, `panel`, `line`, `ink`, `accent`…) —
 *     CSS değişkeninden okur, koyu temada kendiliğinden döner. Yenilenen her
 *     ekran bunu kullanır ve `dark:` ikizlerini siler.
 */

/** `rgb(var(--x) / <alpha>)` — böylece `bg-panel/50` de çalışır. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class", // kullanıcı üst barda seçer — sistem tercihi değil (bkz. lib/theme.ts)
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Anlamsal katman ────────────────────────────────────────────────
        surface: v("surface"), // sayfa zemini
        panel: v("panel"), // kart / tablo / kutu zemini
        sunken: v("sunken"), // girdi, görsel kutusu, gömük alan
        subtle: v("subtle"), // vurgusuz dolgu, üzerine gelince
        line: v("line"), // varsayılan kenar çizgisi
        "line-strong": v("line-strong"), // ayraç, odak kenarı
        ink: v("ink"), // ana metin
        "ink-muted": v("ink-muted"), // ikincil metin
        "ink-faint": v("ink-faint"), // etiket, ipucu
        accent: v("accent"), // birincil eylem (neredeyse siyah / koyuda beyaz)
        "on-accent": v("on-accent"),
        positive: v("positive"),
        caution: v("caution"),
        critical: v("critical"),

        // ── Gri merdiven ───────────────────────────────────────────────────
        // Tailwind'in nötrü saf gri; bu palet hafif soğuk. Fark küçük ama
        // beyaz kâğıt yerine "ofis kâğıdı" hissi veren şey bu.
        neutral: {
          50: "#f9f9fb",
          100: "#f3f3f6",
          200: "#dcdee0",
          300: "#c5c6ca",
          400: "#9a9da0",
          500: "#75777a",
          600: "#5d5e61",
          700: "#44474a",
          800: "#2e3132",
          900: "#191c1e",
          950: "#0f1112",
        },

        // "brand" artık indigo değil. Kurumsal birincil renk mürekkep siyahı:
        // düğme siyah, seçili sekme siyah, odak halkası kömür grisi.
        brand: {
          50: "#f2f3f4",
          100: "#e2e2e5",
          200: "#c6c6c9",
          300: "#a2a4a6",
          400: "#6f7274",
          500: "#3d4143",
          600: "#1a1c1e",
          700: "#141618",
          800: "#0d0f10",
          900: "#08090a",
          950: "#000101",
        },
      },

      // Köşeler sıkıldı: 12px yuvarlak kart "uygulama", 8px "belge" gibi durur.
      // Sınıf adları aynı kaldığı için elden geçmemiş ekranlar da sıkıldı.
      borderRadius: {
        none: "0",
        sm: "2px",
        DEFAULT: "4px",
        md: "4px",
        lg: "6px",
        xl: "8px",
        "2xl": "12px",
        "3xl": "16px",
        full: "9999px",
      },

      fontFamily: {
        sans: ["var(--font-inter)", ...defaultTheme.fontFamily.sans],
        // Başlık ayrı bir yazı tipi değil artık: tek aile, ağırlık ve harf
        // aralığı hiyerarşiyi zaten kuruyor. İki aile "sunum" hissi veriyordu.
        display: ["var(--font-inter)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono],
      },

      // Ölçek tasarımdan birebir. Ekranlar kendi `text-[13px]`lerini yazmasın.
      fontSize: {
        label: ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
        "body-sm": ["14px", { lineHeight: "20px" }],
        "body-md": ["16px", { lineHeight: "24px" }],
        "body-lg": ["18px", { lineHeight: "28px" }],
        "headline-sm": ["18px", { lineHeight: "24px", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.01em", fontWeight: "600" }],
        display: ["40px", { lineHeight: "48px", letterSpacing: "-0.02em", fontWeight: "700" }],
      },

      boxShadow: {
        // Kurumsal yüzey gölge ile değil çizgiyle ayrılır. Gölge yalnızca
        // gerçekten üstte duran şeyde (açılır menü, pencere) var.
        card: "none",
        "card-hover": "0 4px 12px -2px rgb(15 17 18 / 0.06)",
        pop: "0 8px 24px -6px rgb(15 17 18 / 0.14), 0 2px 6px -2px rgb(15 17 18 / 0.08)",
      },

      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Kayan kampanya şeridi. İçerik iki kez basılır, %50 kaydırınca dikiş
        // görünmez — sonsuz akış.
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        marquee: "marquee 30s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
