"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Kategori ağacının ortak mekaniği — yönetim tablosu ve vitrin kenar çubuğu.
//
// Neden: ağaç iki yerde de düzleştirilip tek liste hâlinde basılıyordu
// (`docs/design/YOGUNLUK-RAPORU.md` N3). Demo verisinde 34 kök + 17 alt = 51
// satır, hepsi açık. Yönetim tarafında her satır ayrıca bir `<select>`
// taşıyordu: elli bir açılır kutu aynı anda ekranda.
//
// Paylaşılan şey **çizim değil, karar**: hangi düğüm görünür, hangisi açık,
// arama neyi eliyor. İki ekranın görünüşü farklı (biri tablo satırı, biri
// kenar çubuğu düğmesi) ama bu üç sorunun cevabı aynı olmak zorunda — yoksa
// aynı ağaç iki ekranda iki farklı şekilde davranır.
//
// Aramanın ağaçtaki karşılığı özel: eşleşen düğümün **ataları da** görünmeli,
// yoksa sonuç bağlamsız bir isim listesi olur ("Kutu" — neyin altındaki kutu?).
// Arama sürerken açıklık durumu yok sayılıyor; kapalı bir dalın içindeki
// eşleşmeyi saklamak, aramanın kendisini bozar.

const STORE_PREFIX = "b2b.tree.";

/** Ağaca girdi: hangi türü taşıdığı çağıranın işi, mekanik `id`/`name`e bakıyor. */
export interface TreeInput<T> {
  id: string;
  name: string;
  children: TreeInput<T>[];
  data: T;
}

/** Çizime çıkan tek satır. */
export interface TreeRow<T> {
  id: string;
  name: string;
  depth: number;
  data: T;
  hasChildren: boolean;
  open: boolean;
  /** Altındaki **tüm** düğüm sayısı — kapalı satırın künyesi ("3 alt"). */
  descendants: number;
}

/**
 * Düz `parentId` listesini iç içe düğümlere çevirir.
 *
 * Üstü listede olmayan satır düşürülmüyor, köke ekleniyor: yetki süzgeci ya da
 * yarım kalmış bir silme yüzünden ata kaybolduğunda satırın tamamen kaybolması,
 * düzenlenemez bir kategori demek olurdu.
 */
export function nestByParent<
  T extends { id: string; name: string; parentId: string | null },
>(rows: readonly T[]): TreeInput<T>[] {
  const nodes = new Map<string, TreeInput<T>>();
  for (const r of rows) {
    nodes.set(r.id, { id: r.id, name: r.name, children: [], data: r });
  }

  const roots: TreeInput<T>[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    const parent = r.parentId ? nodes.get(r.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Türkçe karşılaştırma: "İstanbul" araması "istanbul" yazınca da bulunmalı. */
function fold(value: string): string {
  return value.toLocaleLowerCase("tr");
}

function countDescendants<T>(node: TreeInput<T>): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

function readOpenIds(storageKey: string | undefined): string[] | null {
  if (!storageKey) return null;
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : null;
  } catch {
    // Gizli sekmede okumak da bozuk JSON da aynı sonuca çıkıyor: varsayılan.
    return null;
  }
}

/**
 * Ağacı çizilecek düz satır listesine indirger — kancanın **saf** çekirdeği.
 *
 * Kancadan ayrı, çünkü karmaşık olan kısım burası ve React'siz sınanabilmesi
 * gerekiyor: hangi düğüm görünür, hangisi açık, arama neyi eliyor.
 *
 * @param search Ham arama kutusu değeri; katlama burada yapılıyor.
 * @param openIds Kullanıcının açtığı düğümler. Arama sürerken yok sayılıyor.
 */
export function flattenTree<T>(
  roots: readonly TreeInput<T>[],
  search: string,
  openIds: ReadonlySet<string>,
): { rows: TreeRow<T>[]; total: number; matches: number | null } {
  const term = fold(search.trim());
  let totalCount = 0;
  let matchCount = 0;

  // Arama varken: eşleşen düğüm + bütün ataları görünür, hepsi açık.
  // Arama yokken: yalnızca açık dalların çocukları görünür.
  const out: TreeRow<T>[] = [];

  // `underMatch`: bir üst düğüm eşleşti mi. Eşleşen bir dalın **altındaki**
  // her şey görünür kalıyor — "Ambalaj" araması yalnızca o satırı verirse
  // kullanıcı dalın içinde ne olduğunu göremez, yani arama ağacı düzleştirir.
  const visit = (
    node: TreeInput<T>,
    depth: number,
    underMatch: boolean,
  ): boolean => {
    totalCount += 1;
    const selfMatch = term !== "" && fold(node.name).includes(term);
    if (selfMatch) matchCount += 1;

    // Önce çocuklar bir ara listeye yazılıyor: düğümün kendisi ancak
    // çocuklarından biri eşleştiyse görünür olacağı için, satırı listeye
    // eklemeden önce çocukların sonucunu bilmek gerekiyor.
    let childMatch = false;
    const before = out.length;
    for (const child of node.children) {
      if (visit(child, depth + 1, underMatch || selfMatch)) childMatch = true;
    }
    const childRows = out.splice(before);

    const visible = term === "" || selfMatch || childMatch || underMatch;
    if (!visible) return false;

    // Arama sürerken açıklık yok sayılıyor: kapalı bir dalın içindeki
    // eşleşmeyi saklamak aramanın kendisini bozar. Görünen her düğüm zaten
    // eşleşmenin yolunda ya da altında.
    const open = term !== "" ? true : openIds.has(node.id);

    out.push({
      id: node.id,
      name: node.name,
      depth,
      data: node.data,
      hasChildren: node.children.length > 0,
      open,
      descendants: countDescendants(node),
    });
    if (open) out.push(...childRows);
    return true;
  };

  for (const root of roots) visit(root, 0, false);

  return {
    rows: out,
    total: totalCount,
    matches: term === "" ? null : matchCount,
  };
}

/**
 * Ağacın durumu: arama terimi, açık düğümler ve çizilecek düz satır listesi.
 *
 * Çıktı düz, çünkü iki çağıranın ikisi de düz çiziyor (biri `<tr>`, biri
 * `<li>`); iç içe çizim tabloda zaten imkânsız. Girinti `depth`ten geliyor.
 */
export function useCategoryTree<T>({
  roots,
  storageKey,
}: {
  roots: TreeInput<T>[];
  storageKey?: string;
}): {
  search: string;
  setSearch: (next: string) => void;
  rows: TreeRow<T>[];
  toggle: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  /** Ağaçtaki toplam düğüm (arama süzgecinden önce). */
  total: number;
  /** Arama açıkken kaç düğüm eşleşti; arama yokken `null`. */
  matches: number | null;
} {
  const [search, setSearch] = useState("");
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  // Kayıtlı açıklık ilk çizimden **sonra** uygulanıyor: sunucunun bilmediği
  // bir değerle çizmek hidrasyonu bozar (`disclosure.tsx`teki aynı kural).
  useEffect(() => {
    const saved = readOpenIds(storageKey);
    if (saved) setOpenIds(new Set(saved));
  }, [storageKey]);

  const persist = useCallback(
    (next: ReadonlySet<string>) => {
      if (!storageKey) return;
      try {
        window.localStorage.setItem(
          STORE_PREFIX + storageKey,
          JSON.stringify([...next]),
        );
      } catch {
        // Yazamıyorsak da açılıp kapanmaya devam etsin.
      }
    },
    [storageKey],
  );

  const toggle = useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const allIds = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: TreeInput<T>[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) out.push(n.id);
        walk(n.children);
      }
    };
    walk(roots);
    return out;
  }, [roots]);

  const expandAll = useCallback(() => {
    const next = new Set(allIds);
    setOpenIds(next);
    persist(next);
  }, [allIds, persist]);

  const collapseAll = useCallback(() => {
    const next = new Set<string>();
    setOpenIds(next);
    persist(next);
  }, [persist]);

  const { rows, total, matches } = useMemo(
    () => flattenTree(roots, search, openIds),
    [roots, search, openIds],
  );

  return {
    search,
    setSearch,
    rows,
    toggle,
    expandAll,
    collapseAll,
    total,
    matches,
  };
}

/**
 * Satırın başındaki aç/kapa oku.
 *
 * Çocuğu olmayan düğümde de aynı genişlikte boşluk bırakıyor: yoksa yaprak
 * satırların adı on altı piksel sola kayıyor ve girinti bir hiyerarşi değil
 * gürültü gibi okunuyor.
 */
export function TreeToggle({
  open,
  hasChildren,
  label,
  onClick,
}: {
  open: boolean;
  hasChildren: boolean;
  label: string;
  onClick: () => void;
}) {
  if (!hasChildren)
    return <span aria-hidden className="inline-block w-5 shrink-0" />;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${label} — ${open ? "kapat" : "aç"}`}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded",
        "text-ink-faint transition-colors hover:bg-subtle hover:text-ink",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-muted",
      )}
    >
      <ChevronRight
        aria-hidden
        className={cn(
          "h-3.5 w-3.5 transition-transform motion-reduce:transition-none",
          open && "rotate-90",
        )}
      />
    </button>
  );
}
