import type sql from "mssql";
import type { AgentConfig } from "./config";
import { firmTable, periodTable } from "./vega";
import {
  EMPTY_DATE,
  dec,
  gk,
  insertRow,
  nextDocumentNumber,
  raw,
  readColumns,
  uid,
  withTransaction,
  type ColumnInfo,
  type Tx,
} from "./vega-write";

// Siparişi Vega'ya yazmak — `TBLALSIPBASLIK` + `TBLALSIPHAREKET`.
//
// **Neden sipariş, neden fatura değil.** An order (BELGETIPI 60) is not a legal
// document, and the guide's own document map (§20.1) shows it touching nothing
// else: it writes no stock movement, no cari ledger row, no inventory delta.
// Two tables, one transaction, and a reversal that is two DELETEs. An invoice
// would have been five tables, a customer's balance and their VAT return.
//
// The customer checks the order inside Vega and turns it into an invoice there,
// with their own e-fatura module. That is the whole division of labour: this
// system writes the document, their ERP files it.
//
// Everything this writes is derived from the payload the B2B sends — normalised
// order lines, never SQL. The Vega-specific column names below exist only here,
// on the customer's own machine.

export interface WriteOrderLine {
  /** ERP'deki stok kodu — `ProductVariant.externalCode`. */
  productCode: string;
  name: string;
  quantity: number;
  unit?: string | null;
  /** KDV hariç, **iskontolar düşülmüş** birim fiyat. */
  unitPrice: number;
  /** KDV hariç satır toplamı (`GERCEKTOPLAM`). */
  lineTotal: number;
  /** KDV **oranı**, yüzde olarak. */
  vatRate: number;
  note?: string | null;
}

export interface WriteOrderPayload {
  /** b2b sipariş numarası. Aynı siparişin ikinci kez yazılmasını bu engelliyor. */
  reference: string;
  /** ERP'deki cari kodu — `Company.externalCode` (`TBLCARI.FIRMAKODU`). */
  customerCode: string;
  /** Belge tarihi (ISO). Boşsa bugün. */
  date?: string | null;
  currency?: string | null;
  exchangeRate?: number | null;
  note?: string | null;
  /** KDV hariç mal bedeli (`ARATOPLAM`). */
  netTotal: number;
  /** KDV dahil genel toplam (`TUTAR`). */
  grandTotal: number;
  lines: WriteOrderLine[];
}

export interface WriteOrderResult {
  documentNumber: string;
  documentInd: number;
  lineCount: number;
  /** Bu sipariş zaten yazılmıştı; hiçbir şey eklenmedi. */
  duplicate: boolean;
  /**
   * Bu kurulumun tablosunda bulunmayan, bu yüzden yazılamayan alanlar.
   *
   * Not an error — §44 exists so a missing column cannot drop a document — but
   * the operator should see it: a header missing `PARABIRIMI` means the
   * currency did not land anywhere.
   */
  omittedColumns: string[];
}

const MAX_LINES = 500;

class WriteError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "WriteError";
  }
}

function requireText(value: unknown, field: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new WriteError(`${field} boş olamaz`, "GECERSIZ_ISTEK");
  return text.slice(0, max);
}

function requireNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new WriteError(`${field} sayı olmalı`, "GECERSIZ_ISTEK");
  return n;
}

/**
 * Gelenin şeklini burada doğruluyoruz.
 *
 * The caller is our own B2B, which validated all of this already. It is checked
 * again because this process sits inside someone's accounting database and a
 * bug on the other side of a tunnel is not a reason to write a broken document.
 */
export function parseWriteOrderPayload(input: unknown): WriteOrderPayload {
  const body = (input ?? {}) as Record<string, unknown>;
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) throw new WriteError("Siparişte satır yok", "GECERSIZ_ISTEK");
  if (lines.length > MAX_LINES) {
    throw new WriteError(`Sipariş ${MAX_LINES} satırdan uzun olamaz`, "GECERSIZ_ISTEK");
  }

  return {
    reference: requireText(body.reference, "reference", 60),
    customerCode: requireText(body.customerCode, "customerCode", 60),
    date: typeof body.date === "string" ? body.date : null,
    currency: typeof body.currency === "string" ? body.currency.trim().slice(0, 10) : null,
    exchangeRate:
      body.exchangeRate == null ? null : requireNumber(body.exchangeRate, "exchangeRate"),
    note: typeof body.note === "string" ? body.note : null,
    netTotal: requireNumber(body.netTotal, "netTotal"),
    grandTotal: requireNumber(body.grandTotal, "grandTotal"),
    lines: lines.map((line, i) => {
      const l = (line ?? {}) as Record<string, unknown>;
      const quantity = requireNumber(l.quantity, `lines[${i}].quantity`);
      if (quantity <= 0) {
        throw new WriteError(`lines[${i}].quantity sıfırdan büyük olmalı`, "GECERSIZ_ISTEK");
      }
      const vatRate = requireNumber(l.vatRate, `lines[${i}].vatRate`);
      if (vatRate < 0 || vatRate > 100) {
        throw new WriteError(`lines[${i}].vatRate 0-100 aralığında olmalı`, "GECERSIZ_ISTEK");
      }
      return {
        productCode: requireText(l.productCode, `lines[${i}].productCode`, 60),
        name: typeof l.name === "string" ? l.name.trim().slice(0, 200) : "",
        quantity,
        unit: typeof l.unit === "string" ? l.unit.trim().slice(0, 20) : null,
        unitPrice: requireNumber(l.unitPrice, `lines[${i}].unitPrice`),
        lineTotal: requireNumber(l.lineTotal, `lines[${i}].lineTotal`),
        vatRate,
        note: typeof l.note === "string" ? l.note : null,
      };
    }),
  };
}

/**
 * Para birimi kodunu Vega'nın kullandığı koda çevirir.
 *
 * The B2B speaks ISO — `TRY` — and Vega's own documents say `TL`. The mapping
 * lives here because this is the file that knows Vega; the payload crossing the
 * tunnel stays ERP-agnostic, exactly like the read side's normalised rows.
 */
function vegaCurrency(currency: string | null | undefined): string {
  const code = (currency ?? "").trim().toUpperCase();
  if (!code || code === "TRY" || code === "TL") return "TL";
  return code;
}

/** Yazılmak istenen ama tabloda karşılığı olmayan alanların adları. */
function omitted(columns: Map<string, ColumnInfo>, fields: Record<string, unknown>): string[] {
  return Object.keys(fields).filter((f) => !columns.has(f.toUpperCase()));
}

interface Resolved {
  cariInd: number;
  stockInd: Map<string, number>;
}

/**
 * Cari ve stok kodlarını ERP'nin kendi kimliklerine çevirir.
 *
 * **Eşler, oluşturmaz** — the same rule the read side follows. A code that is
 * not in the ERP stops the whole document: a partially-written order, with the
 * unmatched lines quietly missing, is the kind of thing that gets noticed after
 * it has shipped.
 */
async function resolveCodes(
  tx: Tx,
  cfg: AgentConfig,
  payload: WriteOrderPayload,
): Promise<Resolved> {
  const cari = firmTable(cfg, "CARI");
  const stoklar = firmTable(cfg, "STOKLAR");

  const customers = await tx.query<{ ind: number }>(
    `SELECT TOP 2 IND AS ind FROM [${cari}]
      WHERE LTRIM(RTRIM(FIRMAKODU)) = @code AND ISNULL(STATUS, 1) <> 2`,
    { code: payload.customerCode },
  );
  if (customers.length === 0) {
    throw new WriteError(
      `ERP'de "${payload.customerCode}" kodlu aktif cari yok. Firmanın ERP kodunu düzeltin.`,
      "CARI_YOK",
    );
  }
  if (customers.length > 1) {
    // Two live cari with one code is the ERP's own data problem, but picking
    // one of them would put the order on a random customer's account.
    throw new WriteError(
      `ERP'de "${payload.customerCode}" kodlu birden fazla aktif cari var.`,
      "CARI_COKLU",
    );
  }

  const codes = [...new Set(payload.lines.map((l) => l.productCode))];
  const params: Record<string, unknown> = {};
  const placeholders = codes.map((code, i) => {
    params[`s${i}`] = code;
    return `@s${i}`;
  });
  const stocks = await tx.query<{ ind: number; code: string }>(
    `SELECT IND AS ind, LTRIM(RTRIM(STOKKODU)) AS code FROM [${stoklar}]
      WHERE LTRIM(RTRIM(STOKKODU)) IN (${placeholders.join(", ")})
        AND ISNULL(IPTAL, 0) = 0`,
    params,
  );

  const stockInd = new Map<string, number>();
  for (const row of stocks) stockInd.set(String(row.code), Number(row.ind));

  const missing = codes.filter((c) => !stockInd.has(c));
  if (missing.length > 0) {
    throw new WriteError(
      `ERP'de bulunmayan stok kodu: ${missing.slice(0, 10).join(", ")}` +
        (missing.length > 10 ? ` (+${missing.length - 10} tane daha)` : ""),
      "STOK_YOK",
    );
  }

  const cariInd = Number(customers[0]!.ind);
  return { cariInd, stockInd };
}

/**
 * Siparişi yazar. Tek transaction, iki tablo.
 *
 * The duplicate check happens inside the same transaction that takes the
 * document number, under `UPDLOCK, HOLDLOCK`: two presses of the button a
 * second apart cannot both get past it.
 */
export async function writeOrder(
  pool: sql.ConnectionPool,
  cfg: AgentConfig,
  payload: WriteOrderPayload,
): Promise<WriteOrderResult> {
  return withTransaction(pool, (tx) => writeOrderWithin(tx, cfg, payload));
}

/**
 * Yazmanın kendisi — çağıran taraf işlemi (transaction) açmış olmalı.
 *
 * Split from `writeOrder` so the whole document can be exercised against a fake
 * transaction in tests: numbering, the duplicate short-circuit, unmatched codes
 * and the schema-adaptive insert are all testable without a SQL Server.
 */
export async function writeOrderWithin(
  tx: Tx,
  cfg: AgentConfig,
  payload: WriteOrderPayload,
): Promise<WriteOrderResult> {
  if (!cfg.write.enabled) {
    // Layer one of the guide's three-layer lock (§43.1). The message is the
    // instruction, because whoever sees it is the person who can lift it.
    throw new WriteError(
      "ERP'ye yazma bu ajanda kapalı. agent.config.json içinde write.enabled değerini " +
        "açın (ve VEGADB kullanıcısına yazma yetkisi verin).",
      "YAZMA_KAPALI",
    );
  }

  const headerTable = periodTable(cfg, "ALSIPBASLIK");
  const lineTable = periodTable(cfg, "ALSIPHAREKET");
  const referenceColumn = cfg.write.referenceColumn;
  const date = payload.date ? new Date(payload.date) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new WriteError("date geçerli bir tarih değil", "GECERSIZ_ISTEK");
  }

  const headerColumns = await readColumns(tx, headerTable);
  const lineColumns = await readColumns(tx, lineTable);

  // Fail closed. Without the marker column there is no way to tell a second
  // push from a first, and the failure mode of guessing is a duplicate order
  // in a customer's ERP.
  if (!headerColumns.has(referenceColumn.toUpperCase())) {
    throw new WriteError(
      `${headerTable} tablosunda "${referenceColumn}" sütunu yok — b2b sipariş numarası ` +
        `yazılamaz, mükerrer kayıt engellenemez. describeOrderTables ile gerçek sütunlara ` +
        `bakıp write.referenceColumn değerini düzeltin.`,
      "REFERANS_SUTUNU_YOK",
    );
  }

  const existing = await tx.query<{ ind: number; belgeNo: string | null }>(
    `SELECT TOP 1 IND AS ind, BELGENO AS belgeNo
       FROM [${headerTable}] WITH (UPDLOCK, HOLDLOCK)
      WHERE LTRIM(RTRIM([${referenceColumn}])) = @reference`,
    { reference: payload.reference },
  );
  const already = existing[0];
  if (already) {
    return {
      documentNumber: String(already.belgeNo ?? "").trim(),
      documentInd: Number(already.ind),
      lineCount: 0,
      duplicate: true,
      omittedColumns: [],
    };
  }

  const { cariInd, stockInd } = await resolveCodes(tx, cfg, payload);
  const documentNumber = await nextDocumentNumber(tx, headerTable, cfg.write.orderPrefix);

  const headerFields: Record<string, unknown> = {
    BELGENO: documentNumber,
    TARIH: date,
    ODEMETARIHI: date,
    TERMIN: EMPTY_DATE,
    FIRMANO: cariInd,
    BELGETIPI: 60,
    EKBELGETIPI: 0,
    HAREKETDEPOSU: cfg.write.depo,
    TUTAR: dec(payload.grandTotal),
    ARATOPLAM: dec(payload.netTotal),
    // Başlıktaki KDV bir **bayrak**: "fiyatlar KDV dahil mi" (kılavuz §22.5).
    // Satırların fiyatı KDV hariç gidiyor, o yüzden 0.
    KDV: 0,
    IPTAL: 0,
    IADE: 0,
    CONVERTED: 0,
    GIRIS: 0,
    PARABIRIMI: vegaCurrency(payload.currency),
    KUR: dec(payload.exchangeRate ?? 1),
    USERNO: cfg.write.userNo,
    ALTNOT: payload.note ?? null,
    OZELKOD1: cfg.write.branch,
    OZELKOD2: cfg.write.till,
    [referenceColumn]: payload.reference,
    UID: uid(),
  };

  const documentInd = await insertRow(tx, headerTable, headerColumns, headerFields, {
    required: ["BELGENO", "TARIH", "FIRMANO", "BELGETIPI", "TUTAR", "ARATOPLAM"],
    expressions: {
      CREDATE: raw("GETDATE()"),
      LADATE: raw("GETDATE()"),
      SIRALAMATARIHIEX: raw("CONVERT(FLOAT, GETDATE())"),
    },
  });
  if (!documentInd) {
    throw new WriteError("Sipariş başlığı yazıldı ama IND okunamadı", "IND_OKUNAMADI");
  }

  const omittedFields = new Set(omitted(headerColumns, headerFields));

  for (const line of payload.lines) {
    const lineFields: Record<string, unknown> = {
      // Kılavuz §19.1: hareket satırı başlığa **IND** ile bağlanır. Yanlış
      // bağlanan satır hatasız yazılır ve Vega'nın hiçbir ekranında görünmez.
      EVRAKNO: documentInd,
      DETAY: 0,
      TARIH: date,
      FIRMANO: cariInd,
      STOKNO: stockInd.get(line.productCode)!,
      STOKKODU: line.productCode,
      MALINCINSI: line.name,
      STOKTIPI: 0,
      MIKTAR: dec(line.quantity),
      BIRIMMIKTAR: dec(1),
      BIRIM: line.unit ?? null,
      FIYATI: dec(line.unitPrice),
      KDV: dec(line.vatRate),
      GERCEKTOPLAM: dec(line.lineTotal),
      DEPO: cfg.write.depo,
      ENVANTER: dec(line.quantity),
      PARABIRIMI: vegaCurrency(payload.currency),
      KUR: dec(payload.exchangeRate ?? 1),
      ACIKLAMA: line.note ?? null,
      ISK1: 0,
      ISK2: 0,
      ISK3: 0,
      ISK4: 0,
      ISK5: 0,
      ISK6: 0,
      PERSONEL: 0,
      PIRIM: 0,
      OPSIYON: 0,
      PROMOSYON: 0,
      SATISKOSULU: 1,
      SERIMIKTAR: 1,
      MASRAF: 0,
      OIV: 0,
      INDIRIM: 0,
      OTV: 0,
      GRUPMIKTAR: 1,
      // Kılavuz §22.1: satırın rastgele int32 kimliği, içerikten türemez.
      GK: gk(),
    };

    for (const field of omitted(lineColumns, lineFields)) omittedFields.add(field);

    await insertRow(tx, lineTable, lineColumns, lineFields, {
      required: ["EVRAKNO", "STOKNO", "MIKTAR", "FIYATI", "GERCEKTOPLAM"],
    });
  }

  return {
    documentNumber,
    documentInd,
    lineCount: payload.lines.length,
    duplicate: false,
    omittedColumns: [...omittedFields].sort(),
  };
}
