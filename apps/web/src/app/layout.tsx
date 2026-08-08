import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Inter,
  JetBrains_Mono,
  Plus_Jakarta_Sans,
  Sora,
  Space_Grotesk,
} from "next/font/google";
import { FALLBACK_PACK, THEME_PACKS, themeStyleSheet } from "@repo/theme";
import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Başlıklar için ayrı, biraz daha karakterli bir yazı tipi — gövde metniyle
// aynı Inter olsaydı sayfa "yazı işlemcisi" gibi düz dururdu.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

// Ölçen sayılar (SKU, stok, koli, fiyat) için. Vitrinin teknik karakteri
// büyük ölçüde bu yazı tipinden geliyor — bkz. tailwind `font-mono`.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

// Aşağıdaki ikisi yalnızca NEO-MART paketinin yazıları. `preload: false`
// bilerek: yönetim paneline giren biri bu paketi hiç görmeyecek ve her sayfa
// açılışında iki fontu daha indirmesinin sebebi yok. Paket seçildiğinde
// tarayıcı yazıyı ilk kullanan metinle birlikte çeker.
const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-sora",
  display: "swap",
  preload: false,
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-grotesk",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "B2B Portal",
  description: "B2B Order & Management System",
};

// Her paket × her şema, tek bir stil bloğu olarak. Sunum sırasında paket
// değiştirmek tek bir `data-pack` yazımına iniyor: yeni paketin kuralı zaten
// belgede duruyor, ne istek atılıyor ne de yeniden derleme gerekiyor.
const THEME_CSS = themeStyleSheet(THEME_PACKS, FALLBACK_PACK);

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${jakarta.variable} ${mono.variable} ${sora.variable} ${grotesk.variable}`}
    >
      <head>
        <style
          id="theme-packs"
          dangerouslySetInnerHTML={{ __html: THEME_CSS }}
        />
        {/* Boyanmadan önce çalışır — tema `dark:` sınıflarının tersine dönüp
            geri dönmesini (FOUC) engeller. Bkz. lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
