"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Süzgeç durumunu adres çubuğunda tutar.
 *
 * Süzgeçler `useState` içindeyken iki şey birden bozuluyordu:
 *
 * 1. **Paylaşılamıyordu.** "Geçen haftanın başarısız girişleri" bir bağlantı
 *    değil, tarif edilmesi gereken bir tıklama dizisiydi.
 * 2. **Fotoğraflanamıyordu.** Ekran görüntüsü betiği adres ziyaret ediyor,
 *    düğmeye basmıyor — bileşen durumundaki bir sekmenin doğru göründüğü
 *    söylenemez. Stok defterinin dört sekmesi tam bu yüzden `?bolum=` ile
 *    adreslenmişti; bu kanca aynı işi süzgeçler için yapıyor.
 *
 * Sözleşme:
 *
 * - **Varsayılana eşit değer adrese yazılmaz.** Süzgeçsiz ekranın adresi
 *   temiz kalıyor; `?durum=hepsi&vadesi=hayir` gibi hiçbir şey söylemeyen bir
 *   kuyruk paylaşılan bağlantıyı okunmaz yapardı.
 * - **Yalnızca kendi anahtarlarına dokunur.** `?bolum=` gibi başka bir şeyin
 *   sahip olduğu parametreler `set` ve `clear` sonrası yerinde kalıyor.
 * - **`replace`, `push` değil.** Süzgeç değiştirmek gezinme değil: on kez
 *   tıklayan kullanıcı geri düğmesine on kez basmak zorunda kalmamalı.
 * - **`scroll: false`.** Uzun bir listede süzgeç değiştirmek sayfayı başa
 *   sarmıyor.
 *
 * `defaults` **modül düzeyinde sabit** olmalı: satır içi bir nesne her çizimde
 * yeni kimlik alır ve kancanın içindeki hafızalamayı boşa çıkarır.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const keys = useMemo(() => Object.keys(defaults) as (keyof T)[], [defaults]);

  // Adresten okunan değer, `defaults`taki değerle aynı türde olsun diye
  // `as T[keyof T]`: kanca `"hepsi" | "acik"` gibi daraltılmış birleşimlerle
  // çağrılıyor ve `string` dönmek her çağrı yerinde döküm gerektirirdi.
  // Doğrulama çağıranın işi — adres kullanıcı kontrolünde ve buradan gelen
  // değer hiçbir zaman sorguya gitmiyor, yalnızca ekranı süzüyor.
  const value = useMemo(() => {
    const out = { ...defaults };
    for (const k of keys) {
      const raw = params.get(String(k));
      if (raw !== null) out[k] = raw as T[keyof T];
    }
    return out;
  }, [defaults, keys, params]);

  const write = useCallback(
    (next: Partial<T>) => {
      const search = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined) continue;
        if (v === defaults[k]) search.delete(k);
        else search.set(k, String(v));
      }
      const qs = search.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [defaults, params, pathname, router],
  );

  const clear = useCallback(() => {
    const search = new URLSearchParams(params.toString());
    for (const k of keys) search.delete(String(k));
    const qs = search.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [keys, params, pathname, router]);

  /** Süzgeçlerden en az biri varsayılandan farklı mı — "temizle" düğmesi için. */
  const isFiltered = keys.some((k) => value[k] !== defaults[k]);

  return { value, set: write, clear, isFiltered };
}
