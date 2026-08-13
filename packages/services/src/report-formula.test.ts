import { describe, expect, it } from "vitest";
import { FormulaError, compileFormula } from "./report-formula";

// The formula language is small on purpose. These tests are as much about what
// it refuses as about what it computes: it must never become a way to name
// something the report did not already select.

const KEYS = new Set(["ciro", "adet", "iskonto", "grandTotal__sum"]);

const run = (
  expression: string,
  row: Record<string, number | string | null>,
) => compileFormula(expression, KEYS).evaluate(row);

describe("compileFormula", () => {
  it("does the four operations with the usual precedence", () => {
    expect(run("ciro + adet * 2", { ciro: 10, adet: 3 })).toBe(16);
    expect(run("(ciro + adet) * 2", { ciro: 10, adet: 3 })).toBe(26);
    expect(run("ciro / adet", { ciro: 10, adet: 4 })).toBe(2.5);
    expect(run("-ciro + adet", { ciro: 10, adet: 4 })).toBe(-6);
  });

  it("rounds to two decimals like every other report number", () => {
    expect(run("ciro / adet", { ciro: 10, adet: 3 })).toBe(3.33);
    expect(run("iskonto / ciro * 100", { iskonto: 1, ciro: 3 })).toBe(33.33);
  });

  it("reads a value the driver handed over as a string", () => {
    // Aggregates come back from Postgres as numeric strings often enough that
    // treating them as unusable would make the feature useless where it matters.
    expect(run("grandTotal__sum / adet", { grandTotal__sum: "2400.00", adet: 2 })).toBe(
      1200,
    );
  });

  it("accepts a decimal typed with a comma", () => {
    expect(run("ciro * 0,5", { ciro: 10 })).toBe(5);
  });

  it("gives null rather than a wrong number", () => {
    // Division by zero is not Infinity in a report, and a missing value is not
    // a zero: both mean this row cannot answer the question.
    expect(run("ciro / adet", { ciro: 10, adet: 0 })).toBeNull();
    expect(run("ciro / adet", { ciro: 10, adet: null })).toBeNull();
    expect(run("ciro + adet", { ciro: 10, adet: null })).toBeNull();
  });

  it("refuses a name the report does not produce", () => {
    expect(() => compileFormula("ciro / maliyet", KEYS)).toThrowError(
      /maliyet/,
    );
    expect(() => compileFormula("ciro / maliyet", KEYS)).toThrowError(
      FormulaError,
    );
  });

  it("refuses anything that is not arithmetic", () => {
    for (const expression of [
      "ciro > adet",
      "SUM(ciro)",
      "ciro; DROP TABLE",
      "'ciro'",
      "ciro ?? adet",
    ]) {
      expect(() => compileFormula(expression, KEYS)).toThrowError(FormulaError);
    }
  });

  it("refuses a formula that is not finished", () => {
    for (const expression of ["ciro +", "(ciro", "ciro adet", "* ciro"]) {
      expect(() => compileFormula(expression, KEYS)).toThrowError(FormulaError);
    }
  });

  it("refuses a formula made only of constants", () => {
    // Always the same number on every row — invariably a column name that was
    // typed as a number.
    expect(() => compileFormula("2 * 3", KEYS)).toThrowError(/en az bir sütuna/);
  });

  it("refuses a formula longer than the limit and one nested too deep", () => {
    expect(() => compileFormula(`ciro + ${"1 + ".repeat(200)}1`, KEYS)).toThrowError(
      /400 karakter/,
    );
    const deep = `${"(".repeat(25)}ciro${")".repeat(25)}`;
    expect(() => compileFormula(deep, KEYS)).toThrowError(/iç içe/);
  });

  it("reports which columns it reads", () => {
    expect(compileFormula("(ciro - iskonto) / ciro", KEYS).refs.sort()).toEqual([
      "ciro",
      "iskonto",
    ]);
  });
});
