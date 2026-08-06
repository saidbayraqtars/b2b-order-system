import { describe, expect, it } from "vitest";
import { createsReceivable, resolvePaymentTerm } from "./payment-terms";
import { BusinessError } from "./errors";

// resolvePaymentTerm is the gate every order passes through — both the cart
// preview and order creation call it via buildQuote. What it refuses is
// therefore what a buyer cannot do, so the refusals are the point of this file.

const TERM_30 = { id: "term-30", name: "30 gün", days: 30 };
const TERM_60 = { id: "term-60", name: "60 gün", days: 60 };

function company(over: Partial<Parameters<typeof resolvePaymentTerm>[0]> = {}) {
  return {
    allowedPaymentMethods: [],
    paymentTermDays: 15,
    paymentTerms: [TERM_30, TERM_60],
    ...over,
  };
}

describe("createsReceivable", () => {
  it("puts açık hesap and çek on the cari, and nothing else", () => {
    // A cheque is a promise to pay later, so it is credit even though money
    // "changed hands" — whether it clears is the collection's problem.
    expect(createsReceivable("OPEN_ACCOUNT")).toBe(true);
    expect(createsReceivable("CHEQUE")).toBe(true);

    expect(createsReceivable("CASH")).toBe(false);
    expect(createsReceivable("BANK_TRANSFER")).toBe(false);
    expect(createsReceivable("CREDIT_CARD")).toBe(false);
  });
});

describe("resolvePaymentTerm — which methods are offered", () => {
  it("allows every method when the company restricts none", () => {
    // Empty list means "no restriction", not "nothing allowed" — existing
    // customers were never asked, so they keep working.
    for (const m of ["OPEN_ACCOUNT", "CASH", "CHEQUE"] as const) {
      expect(resolvePaymentTerm(company(), { method: m, isSeller: false }).method).toBe(m);
    }
  });

  it("refuses a method the company was restricted away from", () => {
    const c = company({ allowedPaymentMethods: ["CASH", "BANK_TRANSFER"] });

    expect(() =>
      resolvePaymentTerm(c, { method: "OPEN_ACCOUNT", isSeller: false }),
    ).toThrowError(
      expect.objectContaining({ code: "PAYMENT_METHOD_NOT_ALLOWED" }),
    );
    expect(resolvePaymentTerm(c, { method: "CASH", isSeller: false }).method).toBe("CASH");
  });

  it("restricts the seller too — a rep cannot override the customer's methods", () => {
    // The restriction is about the customer, not about who is typing: a rep
    // ordering on their behalf is still bound by it.
    expect(() =>
      resolvePaymentTerm(company({ allowedPaymentMethods: ["CASH"] }), {
        method: "OPEN_ACCOUNT",
        isSeller: true,
      }),
    ).toThrowError(BusinessError);
  });
});

describe("resolvePaymentTerm — which vade is granted", () => {
  it("falls back to the company default when nothing is picked", () => {
    // null means "use Company.paymentTermDays", so the order does not freeze a
    // copy of a term nobody chose.
    expect(
      resolvePaymentTerm(company(), { method: "OPEN_ACCOUNT", isSeller: false }),
    ).toEqual({ method: "OPEN_ACCOUNT", paymentTermDays: null });
  });

  it("takes the days from the picked term, not from the request", () => {
    expect(
      resolvePaymentTerm(company(), {
        method: "OPEN_ACCOUNT",
        paymentTermId: TERM_60.id,
        isSeller: false,
      }).paymentTermDays,
    ).toBe(60);
  });

  it("refuses a term this customer was not offered", () => {
    expect(() =>
      resolvePaymentTerm(company({ paymentTerms: [TERM_30] }), {
        method: "OPEN_ACCOUNT",
        paymentTermId: TERM_60.id,
        isSeller: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "PAYMENT_TERM_NOT_ALLOWED" }));
  });

  it("refuses a buyer inventing its own vade", () => {
    // The whole point of the menu: a buyer posting paymentTermDays: 365 would
    // otherwise grant itself a year of credit.
    expect(() =>
      resolvePaymentTerm(company(), {
        method: "OPEN_ACCOUNT",
        paymentTermDaysOverride: 365,
        isSeller: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "PAYMENT_TERM_NOT_ALLOWED" }));
  });

  it("lets the seller set a free-form vade — reps negotiate", () => {
    expect(
      resolvePaymentTerm(company(), {
        method: "OPEN_ACCOUNT",
        paymentTermDaysOverride: 45,
        isSeller: true,
      }).paymentTermDays,
    ).toBe(45);
  });

  it("prefers the picked term over a seller's override", () => {
    // Both sent: the menu wins, so a stale override left in a form cannot
    // silently outrank what was explicitly chosen.
    expect(
      resolvePaymentTerm(company(), {
        method: "OPEN_ACCOUNT",
        paymentTermId: TERM_30.id,
        paymentTermDaysOverride: 200,
        isSeller: true,
      }).paymentTermDays,
    ).toBe(30);
  });

  it("refuses a vade on a method that is already paid", () => {
    // Dropping it silently would put a due date on a debt that does not exist.
    expect(() =>
      resolvePaymentTerm(company(), {
        method: "CASH",
        paymentTermId: TERM_30.id,
        isSeller: true,
      }),
    ).toThrowError(expect.objectContaining({ code: "PAYMENT_TERM_NOT_ALLOWED" }));
  });

  it("allows a zero-day term on a prepaid method", () => {
    // "Peşin" on a cash sale is not a contradiction — only a positive vade is.
    expect(
      resolvePaymentTerm(company({ paymentTerms: [{ id: "t0", name: "Peşin", days: 0 }] }), {
        method: "CASH",
        paymentTermId: "t0",
        isSeller: false,
      }).paymentTermDays,
    ).toBe(0);
  });

  it("still allows a vade on çek — it is credit, not cash", () => {
    expect(
      resolvePaymentTerm(company(), {
        method: "CHEQUE",
        paymentTermId: TERM_60.id,
        isSeller: false,
      }).paymentTermDays,
    ).toBe(60);
  });
});
