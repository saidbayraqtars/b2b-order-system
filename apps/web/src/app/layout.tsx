import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { tenantBrand } from "@/lib/tenant-brand";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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

// Sekme başlığı da kiracının adını taşıyor: on sekme açık bir tarayıcıda
// "B2B Portal" hangi müşterinin kurulumu olduğunu söylemiyor.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await tenantBrand();
  return { title: brand, description: "B2B Order & Management System" };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const brand = await tenantBrand();

  return (
    <html lang="tr" className={`${inter.variable} ${mono.variable}`}>
      <head>
        {/* Boyanmadan önce çalışır — tema `dark:` sınıflarının tersine dönüp
            geri dönmesini (FOUC) engeller. Bkz. lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface text-ink antialiased">
        <Providers brand={brand}>{children}</Providers>
      </body>
    </html>
  );
}
