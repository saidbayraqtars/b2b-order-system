import { describe, expect, it } from "vitest";
import {
  flattenTree,
  nestByParent,
  type TreeInput,
} from "@/components/category-tree";

// Kategori ağacının görünürlük kararı iki ekranda birden kullanılıyor (yönetim
// tablosu ve vitrin kenar çubuğu) ve ikisinin de aynı davranması gerekiyor.
// Aramanın ağaçtaki karşılığı düz listedekinden farklı: eşleşen düğümün
// *ataları* bağlam için, *altındakiler* dalın okunabilmesi için görünür kalmalı.
// İkisinden biri kaçırılırsa arama ağacı düzleştiriyor.

interface Row {
  id: string;
  name: string;
  parentId: string | null;
}

const ROWS: Row[] = [
  { id: "amb", name: "Ambalaj", parentId: null },
  { id: "kutu", name: "Kutu", parentId: "amb" },
  { id: "poset", name: "Poşet", parentId: "amb" },
  { id: "gida", name: "Gıda", parentId: null },
  { id: "bakliyat", name: "Bakliyat", parentId: "gida" },
  { id: "mercimek", name: "Mercimek", parentId: "bakliyat" },
];

function tree(): TreeInput<Row>[] {
  return nestByParent(ROWS);
}

const CLOSED = new Set<string>();
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("nestByParent", () => {
  it("iki kökü ve alt dalları kuruyor", () => {
    const roots = tree();
    expect(names(roots)).toEqual(["Ambalaj", "Gıda"]);
    expect(names(roots[0]!.children)).toEqual(["Kutu", "Poşet"]);
    expect(names(roots[1]!.children[0]!.children)).toEqual(["Mercimek"]);
  });

  it("üstü listede olmayan satırı düşürmüyor, köke alıyor", () => {
    // Yetki süzgeci ya da yarım kalmış bir silme ata kategoriyi listeden
    // çıkarabiliyor. Satırın tamamen kaybolması, düzenlenemez bir kategori
    // demek olurdu.
    const roots = nestByParent([
      { id: "a", name: "Kök", parentId: null },
      { id: "b", name: "Öksüz", parentId: "yok-boyle-bir-id" },
    ]);
    expect(names(roots)).toEqual(["Kök", "Öksüz"]);
  });
});

describe("flattenTree — arama yokken", () => {
  it("kapalı kökler yalnızca kendilerini çiziyor", () => {
    const { rows, total, matches } = flattenTree(tree(), "", CLOSED);
    expect(names(rows)).toEqual(["Ambalaj", "Gıda"]);
    // `total` görünen değil **ağaçtaki** düğüm sayısı: başlıktaki
    // "Kategoriler (N)" kapalıyken de doğru olmalı.
    expect(total).toBe(6);
    expect(matches).toBeNull();
  });

  it("açık dal çocuklarını çiziyor, torunu değil", () => {
    const { rows } = flattenTree(tree(), "", new Set(["gida"]));
    expect(names(rows)).toEqual(["Ambalaj", "Gıda", "Bakliyat"]);
  });

  it("kapalı satır alt sayısını taşıyor", () => {
    const { rows } = flattenTree(tree(), "", CLOSED);
    const gida = rows.find((r) => r.id === "gida")!;
    // Künye "2 alt" demeli: doğrudan çocuk değil, **bütün** alt ağaç.
    expect(gida.descendants).toBe(2);
    expect(gida.hasChildren).toBe(true);
    expect(gida.open).toBe(false);
  });

  it("derinliği girinti için taşıyor", () => {
    const { rows } = flattenTree(tree(), "", new Set(["gida", "bakliyat"]));
    expect(rows.map((r) => [r.name, r.depth])).toEqual([
      ["Ambalaj", 0],
      ["Gıda", 0],
      ["Bakliyat", 1],
      ["Mercimek", 2],
    ]);
  });
});

describe("flattenTree — arama varken", () => {
  it("eşleşenin atalarını da gösteriyor", () => {
    // "Mercimek" tek başına dönerse kullanıcı neyin altındaki mercimek
    // olduğunu göremez.
    const { rows, matches } = flattenTree(tree(), "mercimek", CLOSED);
    expect(names(rows)).toEqual(["Gıda", "Bakliyat", "Mercimek"]);
    expect(matches).toBe(1);
  });

  it("eşleşenin altındaki her şeyi gösteriyor", () => {
    const { rows, matches } = flattenTree(tree(), "ambalaj", CLOSED);
    expect(names(rows)).toEqual(["Ambalaj", "Kutu", "Poşet"]);
    // Eşleşme sayısı yalnızca **adı** eşleşenler; altındakiler bağlam.
    expect(matches).toBe(1);
  });

  it("kayıtlı açıklığı yok sayıyor", () => {
    // Kapalı bir dalın içindeki eşleşmeyi saklamak aramanın kendisini bozar.
    const { rows } = flattenTree(tree(), "kutu", CLOSED);
    expect(names(rows)).toEqual(["Ambalaj", "Kutu"]);
  });

  it("eşleşmeyen kardeş dalı tamamen eliyor", () => {
    // "Ambalaj" kolu hiç çizilmiyor. "Mercimek" ise çiziliyor: eşleşen
    // "Bakliyat"ın altında ve eşleşen dalın içi okunabilir kalmalı.
    const { rows } = flattenTree(tree(), "bakliyat", CLOSED);
    expect(names(rows)).toEqual(["Gıda", "Bakliyat", "Mercimek"]);
  });

  it("Türkçe büyük/küçük harfi katlıyor", () => {
    // `toLowerCase()` "GIDA"yı "gida" yapar ama "GİDA"yı "gi̇da" yapıyordu;
    // `toLocaleLowerCase("tr")` şart.
    expect(names(flattenTree(tree(), "GIDA", CLOSED).rows)).toContain("Gıda");
    expect(names(flattenTree(tree(), "poŞet", CLOSED).rows)).toContain("Poşet");
  });

  it("baştaki ve sondaki boşluğu atıyor", () => {
    const { matches } = flattenTree(tree(), "  gıda  ", CLOSED);
    expect(matches).toBe(1);
  });

  it("eşleşme yoksa boş liste ve sıfır sayı veriyor", () => {
    // Ekran bu ikisini ayırt ediyor: `matches === 0` "aramanız boş döndü",
    // `matches === null` "arama yok, ağaç boş".
    const { rows, matches } = flattenTree(tree(), "zzz", CLOSED);
    expect(rows).toEqual([]);
    expect(matches).toBe(0);
  });
});
