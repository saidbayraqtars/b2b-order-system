import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  darkMode: "class", // kullanıcı üst barda seçer — sistem tercihi değil (bkz. lib/theme.ts)
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "brand" = indigo'nun adlandırılmış hali. Koddaki mevcut indigo-600
        // kullanımlarını (Button primary, focus ring, linkler) resmileştirir —
        // yeni bir renk ailesi eklemek yerine zaten var olan örtük markayı
        // tek noktadan tutarlı hale getirir.
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-jakarta)", ...defaultTheme.fontFamily.sans],
        // Teknik yazı: SKU, stok, koli, fiyat. Ölçen her sayı bununla dizilir —
        // vitrinin "mühendislik kataloğu" karakteri buradan geliyor.
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono],
      },
      boxShadow: {
        // Düz gölge yerine katmanlı, markaya yakın nötr ton — kurumsal his.
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.08)",
        "card-hover":
          "0 8px 24px -6px rgb(15 23 42 / 0.12), 0 4px 8px -4px rgb(15 23 42 / 0.06)",
      },
      backgroundImage: {
        // Teknik çizim kâğıdı. Vitrin zemininde çok soluk durur; kartların
        // arkasında "ölçekli kâğıt" hissi verir, okumayı bozmaz.
        "tech-grid":
          "linear-gradient(to right, rgb(148 163 184 / 0.18) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.18) 1px, transparent 1px)",
      },
      backgroundSize: {
        "tech-grid": "32px 32px",
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
