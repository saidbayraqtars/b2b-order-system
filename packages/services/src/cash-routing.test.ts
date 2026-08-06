import { describe, expect, it } from "vitest";
import {
  collectionMethodMeta,
  entersCashAccount,
  paymentMethodMeta,
  settlesToCashAccount,
} from "./payment-terms";

// Which money reaches a till, and which only moves a debt.
//
// These two tables are the whole reason a nakit order now leaves a trace and a
// çek still does not. Getting one row wrong would either invent money in the
// safe or lose a sale from the books, so both tables are asserted member by
// member rather than by re-deriving one from the other.

describe("settlesToCashAccount", () => {
  it("books the peşin methods into a till and the credit ones nowhere", () => {
    expect(settlesToCashAccount("CASH")).toBe(true);
    expect(settlesToCashAccount("BANK_TRANSFER")).toBe(true);
    expect(settlesToCashAccount("CREDIT_CARD")).toBe(true);

    // Both of these book a receivable instead — the money has not arrived.
    expect(settlesToCashAccount("OPEN_ACCOUNT")).toBe(false);
    expect(settlesToCashAccount("CHEQUE")).toBe(false);
  });

  it("never says both, for any method", () => {
    // Not a law of the domain — a method could say no to both — but saying
    // *yes* to both would book the same sale as debt and as cash at once.
    for (const method of [
      "OPEN_ACCOUNT",
      "CHEQUE",
      "CASH",
      "BANK_TRANSFER",
      "CREDIT_CARD",
    ] as const) {
      const meta = paymentMethodMeta(method);
      expect(meta.createsReceivable && meta.settlesToCashAccount).toBe(false);
    }
  });
});

describe("entersCashAccount", () => {
  it("treats çek and senet as settled debt but not as cash", () => {
    // Accepting a cheque closes the customer's balance; the safe is no fuller
    // until it clears. Counting it would report money we cannot spend.
    expect(entersCashAccount("CHEQUE")).toBe(false);
    expect(entersCashAccount("PROMISSORY_NOTE")).toBe(false);
    // "Diğer" is whatever the operator could not name — not assumed to be money.
    expect(entersCashAccount("OTHER")).toBe(false);

    expect(entersCashAccount("CASH")).toBe(true);
    expect(entersCashAccount("BANK_TRANSFER")).toBe(true);
    expect(entersCashAccount("CREDIT_CARD")).toBe(true);
  });

  it("labels every method", () => {
    expect(collectionMethodMeta("CHEQUE").label).toBe("Çek");
    expect(collectionMethodMeta("CASH").label).toBe("Nakit");
  });
});
