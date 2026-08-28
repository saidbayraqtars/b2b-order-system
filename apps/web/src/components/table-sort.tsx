"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Th } from "@/components/ui";

// İstemci tarafı tablo sıralaması.
//
// Ayrı dosyada duruyor çünkü `ui.tsx` sunucu bileşenlerinden de içe aktarılıyor
// (`PageHeader`, `Note`, `StatTile`) ve oraya bir kanca koymak o sayfaları
// kırardı. Buradaki her şey `"use client"`.
//
// Sunucuya gitmiyor: 55 kategori, 35 kullanıcı, 2654 ürün — üçü de tek istekte
// geliyor ve zaten bellekte. Sıralamak için ikinci bir tur atmak, kullanıcının
// beklediği anlık tepkiyi ağ gecikmesine bağlamak olurdu. Sunucu tarafı
// sayfalama gerektiren bir liste çıkarsa sıralama da oraya taşınmalı — o zaman
// bu kanca yanlış cevabı verir, çünkü yalnızca *görünen* sayfayı sıralar.

export type SortDirection = "asc" | "desc";

export interface TableSort<T> {
  /** Sıralanmış satırlar. */
  rows: T[];
  activeKey: string | null;
  direction: SortDirection;
  toggle: (key: string) => void;
}

/**
 * Karşılaştırma.
 *
 * Boş değer her zaman sona gidiyor — yönü ne olursa olsun. "En yüksek borç"
 * dendiğinde listenin başında borcu hiç olmayan satırların durması, sıralamanın
 * cevaplamadığı tek soru.
 */
function compare(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // Sayı gibi duran metin sayı gibi sıralanır: tutarlar ve bakiyeler sunucudan
  // `Decimal`in dizgi hâli olarak geliyor ve alfabetik sıralandığında "9" ile
  // "10" ters düşüyor.
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;

  return String(a).localeCompare(String(b), "tr", { numeric: true });
}

export function useTableSort<T>(
  rows: readonly T[],
  options: {
    /** Sütun anahtarından değere. Varsayılan: satırın aynı adlı alanı. */
    value?: (row: T, key: string) => unknown;
    initial?: { key: string; direction?: SortDirection };
  } = {},
): TableSort<T> {
  const [activeKey, setActiveKey] = useState<string | null>(
    options.initial?.key ?? null,
  );
  const [direction, setDirection] = useState<SortDirection>(
    options.initial?.direction ?? "asc",
  );

  const read =
    options.value ?? ((row: T, key: string) => (row as Record<string, unknown>)[key]);

  const sorted = useMemo(() => {
    if (!activeKey) return [...rows];
    const factor = direction === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) => factor * compare(read(a, activeKey), read(b, activeKey)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeKey, direction]);

  return {
    rows: sorted,
    activeKey,
    direction,
    // Aynı sütuna ikinci tık yönü çeviriyor, yeni bir sütun artan başlıyor.
    toggle: (key: string) =>
      setActiveKey((current) => {
        if (current === key) {
          setDirection((d) => (d === "asc" ? "desc" : "asc"));
          return current;
        }
        setDirection("asc");
        return key;
      }),
  };
}

/**
 * Tıklanabilir tablo başlığı.
 *
 * `Th`nin yerine geçmiyor, onu sarıyor: hizalama, dolgu ve punto tek yerde
 * kalsın. Sıralanamayan sütunlar (işlem düğmeleri, künyeler) düz `Th` olarak
 * kalıyor — her başlığı tıklanabilir göstermek, tıklanınca hiçbir şey olmayan
 * başlıklar üretirdi.
 */
export function SortableTh<T>({
  sort,
  sortKey,
  align = "left",
  children,
}: {
  sort: TableSort<T>;
  sortKey: string;
  align?: "left" | "right" | "center";
  children: ReactNode;
}) {
  const active = sort.activeKey === sortKey;
  const Icon = !active
    ? ChevronsUpDown
    : sort.direction === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <Th align={align} className="p-0">
      <button
        type="button"
        onClick={() => sort.toggle(sortKey)}
        aria-label={`${typeof children === "string" ? children : sortKey} sütununa göre sırala`}
        className={cnAlign(align)}
      >
        <span>{children}</span>
        {/* Ok her zaman çiziliyor, yalnızca aktif değilken soluk: sonradan
            beliren bir ikon başlığın genişliğini oynatıyor ve sütunlar
            tıkladıkça yer değiştiriyordu. */}
        <Icon
          className={
            active ? "h-3 w-3 shrink-0 text-ink" : "h-3 w-3 shrink-0 opacity-30"
          }
        />
      </button>
    </Th>
  );
}

function cnAlign(align: "left" | "right" | "center"): string {
  const base =
    "flex w-full items-center gap-1 px-4 py-2.5 font-semibold uppercase tracking-wider transition-colors hover:text-ink";
  if (align === "right") return `${base} justify-end`;
  if (align === "center") return `${base} justify-center`;
  return base;
}
