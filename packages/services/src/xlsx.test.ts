import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx, columnLetter } from "./xlsx";

// The writer produces a ZIP by hand, so the tests read it back the same way:
// find the parts, inflate them and look at the XML. If Excel could not open the
// result, it would be because one of these structural facts is wrong.

/** Pull the parts out of the ZIP by walking the local file headers. */
function unzip(buffer: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(start, start + compressedSize);
    out.set(name, inflateRawSync(data).toString("utf8"));
    offset = start + compressedSize;
  }
  return out;
}

const COLUMNS = [
  { label: "Firma", width: 210 },
  { label: "Ciro" },
  { label: "Tarih" },
];

const ROWS = [
  ["Aş Ölçü Ltd.", 1234.56, "2026-08-13"],
  ["Çift & Tırnak <test>", 0, null],
];

describe("buildXlsx", () => {
  const file = buildXlsx("Ciro raporu", COLUMNS, ROWS);
  const parts = unzip(file);

  it("writes the five parts Excel looks for", () => {
    expect([...parts.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
    ]);
    // A ZIP is only a ZIP if it ends with the central directory record.
    expect(file.readUInt32LE(file.length - 22)).toBe(0x06054b50);
  });

  it("writes numbers as numbers and text as text", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    // The whole reason this exists next to the CSV: a number cell has no type
    // attribute and holds the raw value, so Excel can total the column.
    expect(sheet).toContain('<c r="B2"><v>1234.56</v></c>');
    expect(sheet).toContain('t="inlineStr"');
    // Zero is a number, not an empty cell.
    expect(sheet).toContain('<c r="B3"><v>0</v></c>');
  });

  it("leaves an empty cell out rather than writing a blank string", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).not.toContain('r="C3"');
  });

  it("escapes what would otherwise break the XML", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("Çift &amp; Tırnak &lt;test&gt;");
    // Turkish characters travel as UTF-8, with no BOM or codepage in sight.
    expect(sheet).toContain("Aş Ölçü Ltd.");
  });

  it("carries the column width the report asked for", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<col min="1" max="1" width="30" customWidth="1"/>');
  });

  it("cleans a sheet name Excel would refuse", () => {
    const named = unzip(buildXlsx("Ciro/2026 [özet]", COLUMNS, ROWS));
    expect(named.get("xl/workbook.xml")).toContain('name="Ciro 2026  özet"');
  });

  it("produces the same bytes for the same input", () => {
    // Timestamps are fixed rather than "now", which is what makes the output
    // comparable at all.
    expect(buildXlsx("Ciro raporu", COLUMNS, ROWS).equals(file)).toBe(true);
  });

  it("counts columns past Z", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
  });
});
