import type { ReportCellValue } from "./report-engine";

/**
 * The formula language behind computed report columns.
 *
 * A computed column is arithmetic over the columns the report already produces —
 * "kâr / ciro", "toplam / adet", "(a - b) * 100" — and nothing else. It is
 * parsed here into a small tree and evaluated per row in JavaScript, *after* the
 * query has run.
 *
 * That placement is the security decision. The obvious implementation is to
 * paste the expression into the SELECT list, and it is also how a report
 * designer turns into a SQL console: the registry exists precisely so that
 * nothing arriving from a client is ever used as SQL. Here the expression never
 * reaches the database at all. The worst a malformed one can do is fail to
 * parse, and the worst a valid one can do is produce a number.
 *
 * What the language deliberately does not have: function calls, strings,
 * comparisons, and any way to name a field the report did not already select.
 * Every identifier must resolve to an output column of the same report.
 */

const MAX_LENGTH = 400;
const MAX_DEPTH = 20;

export class FormulaError extends Error {}

// ─────────────────────────────────────────────
// TOKENS
// ─────────────────────────────────────────────

type Token =
  | { kind: "number"; value: number }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" };

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }

    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", value: ch });
      i += 1;
      continue;
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }

    if (DIGIT.test(ch) || (ch === "." && DIGIT.test(source[i + 1] ?? ""))) {
      let text = "";
      let seenDot = false;
      while (i < source.length) {
        const c = source[i]!;
        if (DIGIT.test(c)) {
          text += c;
        } else if ((c === "." || c === ",") && !seenDot) {
          // A Turkish keyboard produces "0,5" as readily as "0.5", and refusing
          // it would be a puzzle rather than a rule.
          seenDot = true;
          text += ".";
        } else {
          break;
        }
        i += 1;
      }
      const value = Number(text);
      if (Number.isNaN(value)) throw new FormulaError(`Geçersiz sayı: ${text}`);
      tokens.push({ kind: "number", value });
      continue;
    }

    if (IDENT_START.test(ch)) {
      let text = "";
      while (i < source.length && IDENT_PART.test(source[i]!)) {
        text += source[i]!;
        i += 1;
      }
      tokens.push({ kind: "ident", value: text });
      continue;
    }

    throw new FormulaError(`Formülde beklenmeyen karakter: ${ch}`);
  }

  return tokens;
}

// ─────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────

type Node =
  | { kind: "number"; value: number }
  | { kind: "ref"; key: string }
  | { kind: "neg"; operand: Node }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node };

/**
 * Recursive descent, precedence-climbing by hand: `+ -` bind loosest, then
 * `* /`, then unary minus, then a number, a column or a bracketed expression.
 */
function parse(tokens: Token[]): Node {
  let pos = 0;
  let depth = 0;

  const peek = (): Token | undefined => tokens[pos];
  const eat = (): Token => {
    const token = tokens[pos];
    if (!token) throw new FormulaError("Formül eksik bitti");
    pos += 1;
    return token;
  };

  function expression(): Node {
    let left = term();
    for (;;) {
      const token = peek();
      if (token?.kind !== "op" || (token.value !== "+" && token.value !== "-")) {
        return left;
      }
      eat();
      left = { kind: "binary", op: token.value, left, right: term() };
    }
  }

  function term(): Node {
    let left = unary();
    for (;;) {
      const token = peek();
      if (token?.kind !== "op" || (token.value !== "*" && token.value !== "/")) {
        return left;
      }
      eat();
      left = { kind: "binary", op: token.value, left, right: unary() };
    }
  }

  function unary(): Node {
    const token = peek();
    if (token?.kind === "op" && token.value === "-") {
      eat();
      return { kind: "neg", operand: unary() };
    }
    if (token?.kind === "op" && token.value === "+") {
      eat();
      return unary();
    }
    return primary();
  }

  function primary(): Node {
    const token = eat();
    if (token.kind === "number") return { kind: "number", value: token.value };
    if (token.kind === "ident") return { kind: "ref", key: token.value };
    if (token.kind === "paren" && token.value === "(") {
      depth += 1;
      if (depth > MAX_DEPTH) {
        throw new FormulaError("Formül fazla iç içe geçmiş");
      }
      const inner = expression();
      const close = eat();
      if (close.kind !== "paren" || close.value !== ")") {
        throw new FormulaError("Kapanmayan parantez");
      }
      depth -= 1;
      return inner;
    }
    throw new FormulaError(
      token.kind === "paren"
        ? "Beklenmeyen parantez"
        : `Formülde beklenmeyen ifade: ${String(token.value)}`,
    );
  }

  const root = expression();
  if (pos !== tokens.length) {
    throw new FormulaError("Formülün sonu anlaşılmadı");
  }
  return root;
}

// ─────────────────────────────────────────────
// COMPILE + EVALUATE
// ─────────────────────────────────────────────

export interface CompiledFormula {
  /** Output columns the expression reads — all verified to exist. */
  refs: string[];
  /** Row → value. Null when the row cannot answer it; never throws. */
  evaluate: (row: Record<string, ReportCellValue>) => number | null;
}

/**
 * Parse an expression and bind it to a known set of output columns.
 *
 * `allowed` is the report's own output keys, which is what makes an unknown
 * name an error at save time instead of a silently empty column at run time.
 */
export function compileFormula(
  expression: string,
  allowed: ReadonlySet<string>,
): CompiledFormula {
  if (expression.length > MAX_LENGTH) {
    throw new FormulaError(`Formül en fazla ${MAX_LENGTH} karakter olabilir`);
  }

  const ast = parse(tokenize(expression));

  const refs = new Set<string>();
  (function walk(node: Node): void {
    if (node.kind === "ref") {
      if (!allowed.has(node.key)) {
        throw new FormulaError(`Formüldeki "${node.key}" bir çıktı sütunu değil`);
      }
      refs.add(node.key);
      return;
    }
    if (node.kind === "neg") return walk(node.operand);
    if (node.kind === "binary") {
      walk(node.left);
      walk(node.right);
    }
  })(ast);

  if (refs.size === 0) {
    // A formula of constants is the same number on every row; it is always a
    // mistake — usually a column name that was typed as a number.
    throw new FormulaError("Formül en az bir sütuna başvurmalı");
  }

  return {
    refs: [...refs],
    evaluate: (row) => {
      const value = evaluateNode(ast, row);
      if (value === null || !Number.isFinite(value)) return null;
      return Number(value.toFixed(2));
    },
  };
}

/**
 * Nulls propagate rather than counting as zero, and dividing by zero gives null
 * rather than Infinity. Both say "this row cannot answer that", which is true;
 * turning an unknown into a 0 would put a wrong number in a report that people
 * make decisions from.
 */
function evaluateNode(
  node: Node,
  row: Record<string, ReportCellValue>,
): number | null {
  switch (node.kind) {
    case "number":
      return node.value;
    case "ref": {
      const raw = row[node.key];
      if (raw === null || raw === undefined || typeof raw === "boolean") {
        return null;
      }
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case "neg": {
      const operand = evaluateNode(node.operand, row);
      return operand === null ? null : -operand;
    }
    case "binary": {
      const left = evaluateNode(node.left, row);
      const right = evaluateNode(node.right, row);
      if (left === null || right === null) return null;
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return right === 0 ? null : left / right;
      }
    }
  }
}
