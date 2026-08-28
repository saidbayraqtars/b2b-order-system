import { inflateRawSync } from "node:zlib";

/**
 * A minimal .xlsx reader — the mirror of `xlsx.ts`.
 *
 * Same reasoning as the writer: an xlsx is a ZIP of a few XML parts, and what a
 * bulk import needs from it is one sheet of rows. Writing it here rather than
 * taking a spreadsheet library keeps the dependency list where it is, and the
 * two files can be read side by side — the format the writer produces is
 * exactly the format this parses.
 *
 * Deliberately narrow, and the limits are stated rather than hidden:
 *  - **First worksheet only.** A bulk price file has one sheet; asking which
 *    one would be a question with one possible answer.
 *  - **Values, not formulas.** Excel stores the last computed value next to a
 *    formula and that value is what gets read. A file whose formulas were never
 *    recalculated carries stale values, and no reader can tell.
 *  - **Dates come back as Excel serial numbers.** Nothing in the import needs a
 *    date, so converting them would be code with no caller.
 *
 * `deflate64` and encrypted archives are rejected with a readable message
 * rather than a corrupt parse: Excel does not write either, but "Save As" from
 * some other tool can.
 */

export class SpreadsheetError extends Error {}

/** Bir satır: hücreler metin ya da sayı. Boş hücre `null`. */
export type SheetRow = Array<string | number | null>;

// ─────────────────────────────────────────────
// ZIP
// ─────────────────────────────────────────────

interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * ZIP'i **merkezi dizinden** okuyor, baştan tarayarak değil.
 *
 * Yerel başlıklar akış hâlinde yazıldığında boyut alanları sıfır olabiliyor ve
 * gerçek boyut veri akışının sonundaki tanımlayıcıda duruyor; merkezi dizin ise
 * her zaman dolu. Excel'in kendi dosyaları ikinci biçimi kullanıyor.
 */
function readZip(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new SpreadsheetError("Dosya bozuk: ZIP dizini okunamadı.");
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");

    // Yerel başlığın kendi ad ve ek alan uzunlukları farklı olabiliyor.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);

    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else {
      throw new SpreadsheetError(
        `Dosyanın sıkıştırma biçimi desteklenmiyor (${method}). Excel'den "Excel Çalışma Kitabı (.xlsx)" olarak kaydedin.`,
      );
    }

    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  // İmza sondan aranıyor: yorum alanı imzadan sonra geliyor ve uzunluğu
  // değişken.
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new SpreadsheetError(
    "Bu bir Excel dosyası değil (ZIP imzası yok). CSV yüklüyorsanız dosya uzantısı .csv olmalı.",
  );
}

// ─────────────────────────────────────────────
// XML
// ─────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    // `&amp;` en sonda: önce çözülürse "&amp;lt;" gibi diziler iki kez çözülür.
    .replace(/&amp;/g, "&");
}

/**
 * Paylaşılan metinler.
 *
 * Excel hücre metinlerini varsayılan olarak burada tutuyor ve sayfada yalnızca
 * indeksini yazıyor; bu parça okunmazsa bütün metin hücreleri sayı olarak
 * görünür.
 */
function readSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
    // Zengin metinde parça parça `<t>`ler var; hepsi birleştiriliyor.
    const parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    out.push(
      parts
        .map((p) => decodeEntities(p.replace(/<[^>]+>/g, "")))
        .join(""),
    );
  }
  return out;
}

/** `B12` → 1 (sütun indeksi). */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): SheetRow[] {
  const rows: SheetRow[] = [];

  for (const rowXml of xml.match(/<row\b[\s\S]*?(?:\/>|<\/row>)/g) ?? []) {
    const row: SheetRow = [];
    for (const cellXml of rowXml.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const ref = cellXml.match(/\br="([A-Z]+\d+)"/)?.[1] ?? "A1";
      const type = cellXml.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      const index = columnIndex(ref);

      let value: string | number | null = null;
      if (type === "inlineStr") {
        const parts = cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
        value = parts.map((p) => decodeEntities(p.replace(/<[^>]+>/g, ""))).join("");
      } else {
        const raw = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw !== undefined) {
          const text = decodeEntities(raw);
          if (type === "s") value = shared[Number(text)] ?? "";
          else if (type === "str" || type === "e") value = text;
          else if (type === "b") value = text === "1" ? "Evet" : "Hayır";
          else {
            const n = Number(text);
            value = Number.isFinite(n) ? n : text;
          }
        }
      }

      // Boş hücreler atlanmış olabiliyor; indeksine göre yerleştiriliyor ki
      // sütun sırası kaymasın.
      while (row.length < index) row.push(null);
      row[index] = value === "" ? null : value;
    }
    rows.push(row);
  }

  return rows;
}

/** İlk çalışma sayfasının satırları. */
export function readXlsx(buffer: Buffer): SheetRow[] {
  const entries = readZip(buffer);
  const byName = new Map(entries.map((e) => [e.name, e.data]));

  const sharedXml = byName.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = sharedXml ? readSharedStrings(sharedXml) : [];

  // İlk sayfa: `workbook.xml`deki sıra esas alınıyor ama dosya adları her zaman
  // sheet1/2/3 olmadığı için ada göre sıralanmış ilk sayfaya düşülüyor.
  const sheetNames = [...byName.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  const first = sheetNames[0];
  if (!first) {
    throw new SpreadsheetError("Dosyada çalışma sayfası yok.");
  }

  return parseSheet(byName.get(first)!.toString("utf8"), shared);
}

/**
 * Noktalı virgülle ayrılmış CSV — `report-preview`in ürettiği biçim.
 *
 * Excel'in Türkçe yerelinde ayraç noktalı virgül ve ondalık virgül; ikisi de
 * burada karşılanıyor. Virgülle ayrılmış dosyalar da okunuyor: ayraç ilk
 * satırdaki sayıya göre seçiliyor, çünkü kullanıcı hangi Excel'den kaydettiğini
 * bilmiyor.
 */
export function readCsv(text: string): SheetRow[] {
  // BOM: Türkçe Excel'in ürettiği CSV her zaman onunla başlıyor.
  const body = text.replace(/^\uFEFF/, "");
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const rows: SheetRow[] = [];
  let row: SheetRow = [];
  let field = "";
  let quoted = false;

  const pushField = () => {
    const trimmed = field.trim();
    row.push(trimmed === "" ? null : trimmed);
    field = "";
  };

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) pushField();
    else if (ch === "\n") {
      pushField();
      rows.push(row);
      row = [];
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    pushField();
    rows.push(row);
  }

  return rows;
}

/**
 * Uzantıya göre okuma.
 *
 * Uzantı yerine içeriğe bakılıyor: bir kullanıcı `.xlsx` uzantılı bir CSV
 * kaydedebiliyor (Excel "farklı kaydet"te uzantıyı korumayı öneriyor) ve o
 * dosyada ZIP imzası olmuyor.
 */
export function readSpreadsheet(buffer: Buffer): SheetRow[] {
  const isZip =
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
  return isZip ? readXlsx(buffer) : readCsv(buffer.toString("utf8"));
}

/**
 * Türkçe Excel'in ürettiği sayı metnini sayıya çevirir: `1.234,56` → 1234.56.
 *
 * Hücre zaten sayıysa dokunulmuyor. Belirsiz olan tek durum `1.234`: hem bin
 * ayracı hem ondalık olabilir. Nokta **bin ayracı** sayılıyor çünkü Türkçe
 * yerelde öyle ve fiyat listesi Türkçe Excel'den geliyor — ama yalnızca
 * noktadan sonra tam üç hane varsa, ki `1.5` gibi bir girdi 1,5 olarak
 * okunsun.
 */
export function parseDecimal(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = value.trim().replace(/\s/g, "");
  if (text === "") return null;

  let normalized = text;
  if (text.includes(",")) {
    // Virgül varsa ondalık ayracı odur; nokta bin ayracıdır.
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, "");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
