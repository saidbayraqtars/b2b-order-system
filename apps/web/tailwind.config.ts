import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
// Aynı eşleme mobilde de kullanılıyor; orada dosya düz Node ile okunduğu için
// CommonJS. Bkz. packages/theme/tailwind.cjs.
import { themeExtension } from "@repo/theme/tailwind";

const theme = themeExtension({ web: true });

export default {
  darkMode: "class", // kullanıcı üst barda seçer — sistem tercihi değil (bkz. lib/theme.ts)
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Anlamsal katman: `bg`, `surface`, `primary`, `danger`… Değerleri
        // CSS değişkeninden gelir, değişkenleri de tasarım paketi yazar
        // (@repo/theme). Sunum sırasında paket değişince bu sınıfları kullanan
        // her yer anında yeniden boyanır — yeniden derleme yok.
        ...theme.colors,

        // Eski, sabit indigo ailesi. Yönetim paneli hâlâ bunu kullanıyor ve
        // bilerek öyle kalıyor: paket değiştirmek vitrini değiştirir, veri
        // giriş ekranlarını değil.
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
        // `sans` paketin gövde yazısı; `display`/`label`/`mono` da paketten.
        // Yedekler yerinde: değişken bir sebeple boş kalırsa sayfa yazısız
        // kalmaz, sistem yazı tipine düşer.
        sans: [...theme.fontFamily.body, ...defaultTheme.fontFamily.sans],
        display: [...theme.fontFamily.display, ...defaultTheme.fontFamily.sans],
        label: [...theme.fontFamily.label, ...defaultTheme.fontFamily.sans],
        mono: [...theme.fontFamily.mono, ...defaultTheme.fontFamily.mono],
      },
      borderRadius: theme.borderRadius,
      boxShadow: theme.boxShadow!,
      backgroundImage: theme.backgroundImage!,
      backgroundSize: theme.backgroundSize!,
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
