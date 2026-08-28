"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/form";

// Uzun listelerin çizim sınırı.
//
// Kesme **çizimde**, istekte değil: liste zaten bellekte ve sıralama, süzme,
// sayma onun tamamı üzerinde çalışıyor. Sunucudan yalnızca ilk sayfayı isteyip
// "en ucuz önce" diye sıralamak, sayfanın en ucuzunu bütün kataloğun en ucuzu
// diye göstermek olurdu — yani yalan.
//
// Neden gerekiyor: iki bin altı yüz ürünü tek seferde çizen bir sayfa altmış
// bin piksele çıkıyor. Kullanıcı o listeyi zaten kaydırarak okumuyor, arıyor.
// Ekran görüntüsü tarafında da aynı şey: 6000 pikselde kesiliyor ve altındaki
// her şey kayboluyor (Adım 4, 5, 6 ve 10'da toplam altı kez).

/**
 * İlk `step` satır, sonra "daha fazla".
 *
 * Liste değişince (arama, süzgeç, sıralama) sayaç başa dönüyor: yeni bir
 * aramanın 150 satırla açılması, önceki aramada üç kez "daha fazla" demiş
 * olmanın yan etkisi olmamalı.
 */
export function useVisibleSlice<T>(
  rows: readonly T[],
  step = 50,
): {
  visible: T[];
  total: number;
  hidden: number;
  showMore: () => void;
} {
  const [limit, setLimit] = useState(step);

  useEffect(() => setLimit(step), [rows, step]);

  return {
    visible: rows.slice(0, limit) as T[],
    total: rows.length,
    hidden: Math.max(0, rows.length - limit),
    showMore: () => setLimit((n) => n + step),
  };
}

/**
 * Listenin altındaki satır: kaçta kaçı görünüyor ve gerisi nasıl açılır.
 *
 * Gizli satır yokken de çiziliyor (yalnızca sayı olarak): "37 kayıt" demek,
 * hiçbir şey dememekten iyi — kullanıcı listenin bittiğini bilir.
 */
export function ShowMore({
  visible,
  total,
  hidden,
  onMore,
  noun = "kayıt",
  /** Sunucunun kendi tavanı: liste bu sayıda geldiyse gerisi hiç indirilmedi. */
  serverCapped = false,
}: {
  visible: number;
  total: number;
  hidden: number;
  onMore: () => void;
  noun?: string;
  serverCapped?: boolean;
}) {
  if (total === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {hidden > 0 && (
        <Button variant="secondary" size="sm" onClick={onMore}>
          Daha fazla göster
        </Button>
      )}
      <span className="text-xs tabular-nums text-ink-faint">
        {hidden > 0 ? `${visible} / ${total} ${noun}` : `${total} ${noun}`}
        {serverCapped &&
          " · sunucudan gelen ilk sayfa; tamamı için aramayla daraltın"}
      </span>
    </div>
  );
}
