"use client";

import { createContext, useContext, type ReactNode } from "react";

// Kiracının adı, istemci kabuğuna kadar.
//
// Adı okuyan şey (`loadTenant`) dosya sistemine bakıyor, yani yalnızca sunucuda
// çalışıyor; onu kullanan şey (`SidebarShell`) ise bir istemci bileşeni. Aradaki
// köprü bu: kök yerleşim adı bir kez okuyor ve sağlayıcıya veriyor, kabuk da
// oradan alıyor. Alternatif her sayfaya bir prop geçirmekti — altmış bir rota,
// altmış bir kez aynı satır.

const BrandContext = createContext<string | null>(null);

export function BrandProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
  );
}

/** Sağlayıcı yoksa yedeğe düşer — testlerde ve yalıtılmış çizimlerde. */
export function useBrand(fallback = "B2B Portal"): string {
  return useContext(BrandContext) ?? fallback;
}
