import { describe, expect, it } from "vitest";
import type { AgentConfig } from "./config";
import type { Tx } from "./vega-write";
import { parseWriteOrderPayload, writeOrderWithin, type WriteOrderPayload } from "./write-order";

// Sipariş yazma — SQL Server olmadan.
//
// Bu testler bir belgenin *şeklini* koruyor: satırın başlığa hangi alanla
// bağlandığını, mükerrer kaydın nerede durdurulduğunu, eşleşmeyen kodun belgeyi
// hiç yazdırmadığını. Üçü de kılavuzun "sessizce bozar" dediği yerler — yanlış
// bağlanan satır hatasız yazılır ve Vega'nın hiçbir ekranında görünmez.
//
// Sahte işlem (transaction) gerçek bir tabloyu taklit etmiyor; sorgu metnine
// bakıp ne sorulduğunu anlıyor ve yazılan INSERT'leri biriktiriyor. Test edilen
// şey ajanın kurduğu ifade, SQL Server'ın davranışı değil.

interface Insert {
  table: string;
  columns: string[];
  params: Record<string, unknown>;
}

interface FakeOptions {
  headerColumns?: string[];
  lineColumns?: string[];
  /** Yan tabloları (ALSIPLIST / REZERVHAREKETLERI) yok say. */
  withoutSideTables?: boolean;
  existingReference?: { ind: number; belgeNo: string } | null;
  customerInds?: number[];
  stockCodes?: Record<string, number>;
  lastNumber?: { last: number | null; width: number | null };
}

const DEFAULT_HEADER_COLUMNS = [
  "BELGENO",
  "TARIH",
  "ODEMETARIHI",
  "FIRMANO",
  "BELGETIPI",
  "TUTAR",
  "ARATOPLAM",
  "KDV",
  "IPTAL",
  "CONVERTED",
  "PARABIRIMI",
  "KUR",
  "ALTNOT",
  "OZELKOD1",
  "OZELKOD2",
  "OZELKOD3",
  "CREDATE",
];

// Vega'nın kendi yazdığı yan satırlar (kılavuz §62.2).
const LIST_COLUMNS = ["BELGENO", "SATIRNO", "KALAN", "REZERV"];

const RESERVE_COLUMNS = [
  "EVRAKNO",
  "IZAHAT",
  "TARIH",
  "GIREN",
  "CIKAN",
  "TUTAR",
  "FIRMANO",
  "STOKNO",
  "BELGENO",
  "LN",
  "DEPO",
  "KDV",
  "BIRIMFIYAT",
  "KUR",
  "PARABIRIMI",
  "SIRALAMATARIHIEX",
];

const DEFAULT_LINE_COLUMNS = [
  "EVRAKNO",
  "TARIH",
  "FIRMANO",
  "STOKNO",
  "STOKKODU",
  "MALINCINSI",
  "MIKTAR",
  "BIRIM",
  "FIYATI",
  "KDV",
  "GERCEKTOPLAM",
  "GK",
];

// Kılavuz §44.4: Vega'nın **her** satırda doldurduğu kolonlar. Ölçüm
// 09.09.2026, `VEGADBozdemirkaya` F0101/D0017 — 6.748 sipariş başlığı ve
// 15.086 satır. Bir kolonu NULL bırakmak siparişi yazar ama Vega'nın kendi
// sipariş ekranı belgeyi açamayabilir; bu liste onu koruyor.
const ZORUNLU_BASLIK_KOLONLARI = [
  "FIRMAADI", "TUTAR", "BELGENO", "TARIH", "KDV", "AK", "ENVANTERUPDATE",
  "ODEMETARIHI", "ODMODIFIED", "ALTBELGENO", "ALT1", "ALT2", "ALT3", "ALT4",
  "DEPO", "SUCCESS", "OZELKOD", "OZELKOD1", "OZELKOD2", "KALEM1", "KALEM2",
  "KALEM3", "KALEM4", "IADE", "IPTAL", "CONVERTED", "CREDATE", "LADATE",
  "FIRMANO", "PARABIRIMI", "KUR", "YUVARLAMA", "ALLOWYUVARLAMA", "ODENEN",
  "GIRIS", "BELGETIPI", "EKBELGETIPI", "SELECTED", "MASRAF1", "MASRAF2",
  "MASRAF3", "MASRAF4", "MASRAFKDV1", "MASRAFKDV2", "MASRAFKDV3", "MASRAFKDV4",
  "ENTEGRE", "USERNO", "KDVISK", "SATISSEKLI", "ARATOPLAM", "KONSOLIDE",
  "ODEMEOPSIYONU", "TEVKIFATORAN", "STATUS", "MUHASEBELESMEYECEK", "OZELKOD3",
  "OZELKOD4", "HAREKETDEPOSU", "CHECKAPATMA", "KAYNAK", "OZELKOD5", "OZELKOD6",
  "OZELKOD7", "OZELKOD8", "OZELKOD9", "STOKHAREKETEYAZ", "CARIHAREKETEYAZ",
  "UID",
];

const ZORUNLU_SATIR_KOLONLARI = [
  "TARIH", "DETAY", "EVRAKNO", "FIRMANO", "STOKNO", "MALINCINSI", "STOKKODU",
  "STOKTIPI", "MIKTAR", "BIRIMMIKTAR", "BIRIM", "BIRIMEX", "KDV", "ISK1",
  "ISK2", "ISK3", "ISK4", "AFIYATI", "FIYATI", "GERCEKTOPLAM", "DEPO",
  "PERSONEL", "PIRIM", "OPSIYON", "PROMOSYON", "SATISKOSULU", "SERIMIKTAR",
  "ENVANTER", "KARSISTOKKODU", "PARABIRIMI", "KUR", "BARKOD", "MASRAF", "OIV",
  "INDIRIM", "OTV", "GK",
];

function fakeTx(options: FakeOptions = {}): { tx: Tx; inserts: Insert[] } {
  const headerColumns = options.headerColumns ?? DEFAULT_HEADER_COLUMNS;
  const lineColumns = options.lineColumns ?? DEFAULT_LINE_COLUMNS;
  const inserts: Insert[] = [];

  const tx: Tx = {
    run: async () => [],
    query: async <T>(text: string, params?: Record<string, unknown>): Promise<T[]> => {
      // INSERT önce bakılıyor: satır INSERT'i STOKKODU sütununu içeriyor ve
      // aşağıdaki kod-çözme dalına düşerdi.
      if (text.startsWith("INSERT INTO")) {
        const table = /INSERT INTO \[([^\]]+)\]/.exec(text)?.[1] ?? "";
        const columns = (/\(([^)]*)\)/.exec(text)?.[1] ?? "")
          .split(",")
          .map((c) => c.trim().replace(/^\[|\]$/g, ""));
        inserts.push({ table, columns, params: params ?? {} });
        return [{ ind: inserts.length === 1 ? 5150 : 6000 + inserts.length }] as T[];
      }
      if (text.includes("sys.columns")) {
        const table = String(params?.table ?? "");
        let names = headerColumns;
        if (table.endsWith("ALSIPHAREKET")) names = lineColumns;
        else if (table.endsWith("ALSIPLIST")) names = options.withoutSideTables ? [] : LIST_COLUMNS;
        else if (table.endsWith("REZERVHAREKETLERI")) {
          names = options.withoutSideTables ? [] : RESERVE_COLUMNS;
        }
        // Metin sütunlarında bayt cinsinden uzunluk: nvarchar iki bayt/karakter,
        // 40 bayt = 20 karakter. Kırpma testi buna dayanıyor.
        return names.map((name) => ({ name, type: "nvarchar", bytes: 40 })) as T[];
      }
      if (text.includes("UPDLOCK") && text.includes("MAX(CAST")) {
        return [options.lastNumber ?? { last: 41, width: 7 }] as T[];
      }
      if (text.includes("UPDLOCK")) {
        const existing = options.existingReference;
        return (existing ? [{ ind: existing.ind, belgeNo: existing.belgeNo }] : []) as T[];
      }
      if (text.includes("FIRMAKODU")) {
        return (options.customerInds ?? [4711]).map((ind) => ({ ind })) as T[];
      }
      if (text.includes("STOKKODU")) {
        const codes = options.stockCodes ?? { "STK-1": 900, "STK-2": 901 };
        return Object.entries(codes).map(([code, ind]) => ({ code, ind })) as T[];
      }
      return [] as T[];
    },
  };

  return { tx, inserts };
}

function config(overrides: Partial<AgentConfig["write"]> = {}): AgentConfig {
  return {
    apiUrl: "https://b2b.test",
    token: "x".repeat(40),
    db: { server: "localhost", port: 1433, database: "VEGADB", user: "", password: "" },
    vega: { firma: "0101", donem: "0017" },
    command: { enabled: true, host: "127.0.0.1", port: 8787, token: "y".repeat(40) },
    prices: { lists: [{ list: 1, customerGroupCode: null }] },
    write: {
      enabled: true,
      orderPrefix: "B",
      referenceColumn: "OZELKOD3",
      depo: 1,
      userNo: 100,
      branch: "MERKEZ",
      till: "MERKEZ",
      ...overrides,
    },
    intervalMinutes: 30,
    batchSize: 1000,
    sync: { customers: true, stock: true, prices: false, units: true },
  };
}

function payload(overrides: Partial<WriteOrderPayload> = {}): WriteOrderPayload {
  return {
    reference: "SIP-2026-000123",
    customerCode: "120.01.0007",
    date: "2026-08-25T09:00:00.000Z",
    currency: "TRY",
    exchangeRate: 1,
    note: "b2b sipariş SIP-2026-000123",
    netTotal: 1000,
    grandTotal: 1200,
    lines: [
      {
        productCode: "STK-1",
        name: "Ürün bir",
        quantity: 4,
        unit: "ADET",
        unitPrice: 150,
        lineTotal: 600,
        vatRate: 20,
        note: null,
      },
      {
        productCode: "STK-2",
        name: "Ürün iki",
        quantity: 2,
        unit: "KOLİ",
        unitPrice: 200,
        lineTotal: 400,
        vatRate: 20,
        note: null,
      },
    ],
    ...overrides,
  };
}

describe("sipariş yazma", () => {
  it("kilit kapalıyken tek satır yazmaz", async () => {
    const { tx, inserts } = fakeTx();
    await expect(writeOrderWithin(tx, config({ enabled: false }), payload())).rejects.toThrow(
      /yazma bu ajanda kapalı/i,
    );
    expect(inserts).toEqual([]);
  });

  it("başlık ve satırları yazar, satırı başlığın IND'ine bağlar", async () => {
    const { tx, inserts } = fakeTx();
    const result = await writeOrderWithin(tx, config(), payload());

    expect(result.duplicate).toBe(false);
    expect(result.documentInd).toBe(5150);
    expect(result.lineCount).toBe(2);
    // Başlık + her satır için hareket / ALSIPLIST / REZERVHAREKETLERI.
    expect(inserts).toHaveLength(7);

    // Kılavuz §19.1: HAREKET.EVRAKNO = BAŞLIK.IND. Yanlış bağlanan satır
    // hatasız yazılır ve hiçbir ekranda görünmez — bu yüzden test ediliyor.
    const line = inserts[1]!;
    expect(line.table).toContain("ALSIPHAREKET");
    const evraknoParam = line.columns.indexOf("EVRAKNO");
    expect(line.params[`p${evraknoParam}`]).toBe(5150);
  });

  // Kılavuz §62.2: Vega bir sipariş satırını dört tabloya birden yazıyor.
  // Yalnız başlık+hareket yazılırsa sipariş Vega'nın rezerv ve sipariş-takip
  // ekranlarında eksik kalır — sessiz bozulma, bu yüzden test ediliyor.
  // dec() sayıyı { type, value } olarak sarıyor; testte değeri açıyoruz.
  const sayi = (v: unknown) => Number((v as { value: number } | null)?.value ?? v);

  it("her satır için ALSIPLIST ve REZERVHAREKETLERI satırı yazar", async () => {
    const { tx, inserts } = fakeTx();
    await writeOrderWithin(tx, config(), payload());

    const tables = inserts.map((i) => i.table.replace(/^F\d+D\d+TBL/, ""));
    expect(tables).toEqual([
      "ALSIPBASLIK",
      "ALSIPHAREKET",
      "ALSIPLIST",
      "REZERVHAREKETLERI",
      "ALSIPHAREKET",
      "ALSIPLIST",
      "REZERVHAREKETLERI",
    ]);

    const lineInd = 6002; // sahte işlemin ikinci INSERT'e verdiği IND
    const list = inserts[2]!;
    expect(list.params[`p${list.columns.indexOf("BELGENO")}`]).toBe(5150);
    expect(list.params[`p${list.columns.indexOf("SATIRNO")}`]).toBe(lineInd);
    expect(sayi(list.params[`p${list.columns.indexOf("KALAN")}`])).toBe(4);

    // Rezerv satırı stok hareketi deseniyle bağlanır: BELGENO = başlık IND,
    // LN = satır IND.
    const reserve = inserts[3]!;
    expect(reserve.params[`p${reserve.columns.indexOf("IZAHAT")}`]).toBe(60);
    expect(reserve.params[`p${reserve.columns.indexOf("BELGENO")}`]).toBe(5150);
    expect(reserve.params[`p${reserve.columns.indexOf("LN")}`]).toBe(lineInd);
    expect(sayi(reserve.params[`p${reserve.columns.indexOf("GIREN")}`])).toBe(4);
    expect(reserve.columns).toContain("SIRALAMATARIHIEX");
  });

  it("yan tablolar yoksa siparişi yine yazar, eksikleri bildirir", async () => {
    const { tx, inserts } = fakeTx({ withoutSideTables: true });
    const result = await writeOrderWithin(tx, config(), payload());

    expect(result.lineCount).toBe(2);
    expect(inserts).toHaveLength(3);
    expect(result.omittedColumns.join(" ")).toMatch(/ALSIPLIST/);
    expect(result.omittedColumns.join(" ")).toMatch(/REZERVHAREKETLERI/);
  });

  it("belge numarasını kendi önekiyle ve serideki genişlikle üretir", async () => {
    const { tx } = fakeTx({ lastNumber: { last: 41, width: 7 } });
    const result = await writeOrderWithin(tx, config(), payload());
    // Vega'nın "A" serisi sürdürülmüyor: kendi serimiz ayrı yürüyor (§46.3).
    expect(result.documentNumber).toBe("B0000042");
  });

  it("hiç belge yokken sayacı birden başlatır", async () => {
    const { tx } = fakeTx({ lastNumber: { last: null, width: null } });
    const result = await writeOrderWithin(tx, config(), payload());
    expect(result.documentNumber).toBe("B0000001");
  });

  it("aynı sipariş ikinci kez gönderilirse yazmaz, var olanı döner", async () => {
    const { tx, inserts } = fakeTx({
      existingReference: { ind: 4242, belgeNo: "B0000009" },
    });
    const result = await writeOrderWithin(tx, config(), payload());

    expect(result).toMatchObject({ duplicate: true, documentInd: 4242, documentNumber: "B0000009" });
    expect(inserts).toEqual([]);
  });

  it("referans sütunu tabloda yoksa yazmayı reddeder", async () => {
    // Sütun yoksa sipariş numarası belgeye yazılamaz; mükerrer kaydı
    // engelleyen tek şey o. Tahmin etmektense durmak.
    const { tx, inserts } = fakeTx({
      headerColumns: DEFAULT_HEADER_COLUMNS.filter((c) => c !== "OZELKOD3"),
    });
    await expect(writeOrderWithin(tx, config(), payload())).rejects.toThrow(/OZELKOD3/);
    expect(inserts).toEqual([]);
  });

  it("cari kodu eşleşmezse belgeyi hiç yazmaz", async () => {
    const { tx, inserts } = fakeTx({ customerInds: [] });
    await expect(writeOrderWithin(tx, config(), payload())).rejects.toThrow(/kodlu aktif cari yok/);
    expect(inserts).toEqual([]);
  });

  it("aynı kodda iki aktif cari varsa birini seçmez", async () => {
    const { tx } = fakeTx({ customerInds: [4711, 4712] });
    await expect(writeOrderWithin(tx, config(), payload())).rejects.toThrow(/birden fazla/);
  });

  it("tek satırın stok kodu eşleşmese bile belgenin tamamını yazmaz", async () => {
    const { tx, inserts } = fakeTx({ stockCodes: { "STK-1": 900 } });
    await expect(writeOrderWithin(tx, config(), payload())).rejects.toThrow(/STK-2/);
    expect(inserts).toEqual([]);
  });

  it("bu kurulumda olmayan sütunları atlar ve hangileri olduğunu söyler", async () => {
    const { tx, inserts } = fakeTx({
      headerColumns: DEFAULT_HEADER_COLUMNS.filter((c) => c !== "PARABIRIMI"),
    });
    const result = await writeOrderWithin(tx, config(), payload());

    // §44.2: eksik sütun belgeyi düşürmez, ama sessizce de geçilmez.
    expect(result.omittedColumns).toContain("PARABIRIMI");
    expect(inserts[0]!.columns).not.toContain("PARABIRIMI");
    expect(inserts[0]!.columns).toContain("BELGENO");
  });

  it("metni sütunun gerçek genişliğine kırpar", async () => {
    const { tx, inserts } = fakeTx();
    const long = "A".repeat(60);
    await writeOrderWithin(tx, config(), payload({ note: long }));

    const header = inserts[0]!;
    const index = header.columns.indexOf("ALTNOT");
    // nvarchar(20) — sahte şemada 40 bayt. Kırpılmazsa SQL Server
    // "String or binary data would be truncated" ile belgeyi düşürürdü.
    expect(String(header.params[`p${index}`])).toHaveLength(20);
  });

  it("başlıktaki KDV alanına tutar değil bayrak yazar", async () => {
    const { tx, inserts } = fakeTx();
    await writeOrderWithin(tx, config(), payload());

    const header = inserts[0]!;
    const index = header.columns.indexOf("KDV");
    // §22.5: başlıktaki KDV "fiyatlar KDV dahil mi" bayrağı. Bir dönem oraya
    // KDV tutarı yazıldı.
    expect(header.params[`p${index}`]).toBe(0);
  });

  it("TRY'yi Vega'nın kullandığı TL koduna çevirir", async () => {
    const { tx, inserts } = fakeTx();
    await writeOrderWithin(tx, config(), payload());

    const header = inserts[0]!;
    const index = header.columns.indexOf("PARABIRIMI");
    expect(header.params[`p${index}`]).toBe("TL");
  });

  it("Vega'nın her satırda doldurduğu kolonların hepsini yazar (§44.4)", async () => {
    // Tabloda kolonların hepsi varsa ajan hepsini doldurmalı: eksik kalan
    // kolon belgeyi Vega'nın ekranında açılmaz yapabiliyor.
    const { tx, inserts } = fakeTx({
      headerColumns: ZORUNLU_BASLIK_KOLONLARI,
      lineColumns: ZORUNLU_SATIR_KOLONLARI,
    });
    await writeOrderWithin(tx, config(), payload());

    const header = inserts.find((i) => i.table.endsWith("TBLALSIPBASLIK"))!;
    const eksikBaslik = ZORUNLU_BASLIK_KOLONLARI.filter((c) => !header.columns.includes(c));
    expect(eksikBaslik).toEqual([]);

    const line = inserts.find((i) => i.table.endsWith("TBLALSIPHAREKET"))!;
    const eksikSatir = ZORUNLU_SATIR_KOLONLARI.filter((c) => !line.columns.includes(c));
    expect(eksikSatir).toEqual([]);
  });

  it("kolonu olmayan kurulumda o alanı atlar, siparişi yine yazar", async () => {
    // §44.1'in öteki yüzü: kurulumda olmayan kolona INSERT denemek belgenin
    // tamamını düşürür. Kolon listesi dar bir kurulumda sipariş yine yazılmalı.
    const { tx, inserts } = fakeTx();
    const sonuc = await writeOrderWithin(tx, config(), payload());
    expect(sonuc.lineCount).toBe(2);
    expect(inserts[0]!.columns).not.toContain("KONSOLIDE");
  });
});

describe("gelen isteğin doğrulanması", () => {
  it("satırsız siparişi reddeder", () => {
    expect(() => parseWriteOrderPayload({ ...payload(), lines: [] })).toThrow(/satır yok/);
  });

  it("miktarı sıfır olan satırı reddeder", () => {
    const bad = payload();
    bad.lines[0]!.quantity = 0;
    expect(() => parseWriteOrderPayload(bad)).toThrow(/sıfırdan büyük/);
  });

  it("KDV oranı aralık dışındaysa reddeder", () => {
    const bad = payload();
    bad.lines[0]!.vatRate = 120;
    expect(() => parseWriteOrderPayload(bad)).toThrow(/0-100/);
  });

  it("referans boşsa reddeder", () => {
    expect(() => parseWriteOrderPayload({ ...payload(), reference: "  " })).toThrow(
      /reference boş/,
    );
  });

  it("geçerli isteği normalize eder", () => {
    const parsed = parseWriteOrderPayload(payload());
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.customerCode).toBe("120.01.0007");
  });
});
