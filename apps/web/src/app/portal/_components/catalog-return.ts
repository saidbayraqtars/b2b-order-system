"use client";

import { useEffect, useState } from "react";

// Ürün detayından kataloğa dönüş. Katalog süzgeçleri adreste; detay
// sayfasındaki "Katalog" bağlantısı o adresi bilmiyordu ve süzgeçsiz
// katalogu açıyordu. Katalog son adresini oturum deposuna yazıyor, detay
// buradan okuyor.

export const CATALOG_RETURN_KEY = "portal:katalog";

/**
 * Dönüş adresi. Kayıt başka bir firmanın katalogu ise (plasiyer firma
 * değiştirdi) yok sayılır: yanlış firmanın fiyatlarına dönmektense süzgeçsiz
 * doğru firmaya dönmek iyidir.
 */
export function useCatalogReturnHref(companyId: string): string {
  const fallback = `/portal?companyId=${encodeURIComponent(companyId)}`;
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(CATALOG_RETURN_KEY);
      if (!saved?.startsWith("/portal")) return;
      const params = new URLSearchParams(saved.split("?")[1] ?? "");
      const savedCompany = params.get("companyId");
      if (savedCompany && savedCompany !== companyId) return;
      if (!savedCompany) params.set("companyId", companyId);
      setHref(`/portal?${params.toString()}`);
    } catch {
      // Depo okunamıyorsa süzgeçsiz katalog.
    }
  }, [companyId]);
  return href;
}
