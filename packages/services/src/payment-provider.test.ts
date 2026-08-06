import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BusinessError } from "./errors";
import { Dec } from "./money";
import {
  findPaymentProvider,
  manualPaymentProvider,
  paymentProviderCatalog,
  requirePaymentProvider,
} from "./payment-provider-registry";
import { requiresPaymentIntent, settlesToCashAccount } from "./payment-terms";
import { clearTenantCache, paymentSecret, paymentSettings } from "./tenant";

// The registry is the security boundary of the payment path, so what it
// *refuses* is the point of this file — an unknown provider must not silently
// become "no charge, book the money anyway", which is the behaviour step 28
// came to remove.

describe("kart yöntemi ayrımı", () => {
  it("routes card money through an intent, unlike nakit and havale", () => {
    // Both settle into a till in the end. The difference is when: somebody has
    // to actually charge a card, and until they have, the money is not ours.
    expect(settlesToCashAccount("CREDIT_CARD")).toBe(true);
    expect(requiresPaymentIntent("CREDIT_CARD")).toBe(true);

    for (const method of ["CASH", "BANK_TRANSFER"] as const) {
      expect(settlesToCashAccount(method)).toBe(true);
      expect(requiresPaymentIntent(method)).toBe(false);
    }
  });

  it("never asks a credit method to be charged", () => {
    // Açık hesap and çek book debt; there is nothing to capture.
    for (const method of ["OPEN_ACCOUNT", "CHEQUE"] as const) {
      expect(requiresPaymentIntent(method)).toBe(false);
    }
  });
});

describe("registry", () => {
  it("ships the manual provider", () => {
    expect(findPaymentProvider("manual")).toBe(manualPaymentProvider);
    expect(manualPaymentProvider.capabilities.manual).toBe(true);
  });

  it("refuses an unknown key instead of falling back to something", () => {
    // A typo in tenant.json must stop the charge and name the mistake, not
    // quietly leave orders whose money is never asked for.
    let error: unknown;
    try {
      requirePaymentProvider("iyzico-typo");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).code).toBe("PAYMENT_PROVIDER_UNKNOWN");
    expect((error as BusinessError).message).toContain("manual");
  });

  it("marks exactly one provider active in the catalogue", () => {
    const catalog = paymentProviderCatalog("manual");
    expect(catalog.filter((p) => p.active).map((p) => p.key)).toEqual(["manual"]);
  });
});

describe("manual sağlayıcı", () => {
  it("charges nothing on its own — it waits for a human", async () => {
    const result = await manualPaymentProvider.authorize({
      intentId: "int-1",
      amount: new Dec(100),
      currency: "TRY",
      installmentCount: 1,
      orderNumber: "ORD-1",
      companyName: "Acme",
      returnUrl: "https://example.test/orders/1",
    });
    // Not CAPTURED. The card is swiped on a terminal this system cannot see,
    // so the money only exists once somebody says it does.
    expect(result.status).toBe("PENDING");
    expect(result.redirectUrl).toBeUndefined();
  });

  it("captures when asked", async () => {
    const result = await manualPaymentProvider.capture!({
      intentId: "int-1",
      providerRef: null,
      amount: new Dec(100),
    });
    expect(result.status).toBe("CAPTURED");
  });

  it("declares no webhook, so no unverified callback can mark it paid", () => {
    expect(manualPaymentProvider.capabilities.webhook).toBe(false);
    expect(manualPaymentProvider.verifyWebhook).toBeUndefined();
  });
});

describe("yapılandırma", () => {
  let dir: string;
  const originalEnv = process.env.TENANT_DIR;

  const BASE = {
    slug: "acme",
    seller: {
      legalName: "Acme Toptan A.Ş.",
      taxOffice: "Kadıköy",
      taxNumber: "1234567890",
      address: { line1: "Bağdat Cad. No:1", city: "İstanbul" },
    },
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tenant-pay-"));
    process.env.TENANT_DIR = dir;
    clearTenantCache();
  });

  afterEach(async () => {
    process.env.TENANT_DIR = originalEnv;
    clearTenantCache();
    await rm(dir, { recursive: true, force: true });
  });

  async function writeConfig(config: unknown): Promise<void> {
    await writeFile(path.join(dir, "tenant.json"), JSON.stringify(config), "utf8");
    clearTenantCache();
  }

  it("defaults to the manual provider when the block is absent", async () => {
    // Every installation that has not been told otherwise still has a working
    // card workflow, rather than an order that cannot be paid.
    await writeConfig(BASE);
    const settings = await paymentSettings();
    expect(settings.provider).toBe("manual");
    expect(settings.autoCapture).toBe(false);
  });

  it("reads the provider and its non-secret settings", async () => {
    await writeConfig({
      ...BASE,
      payment: { provider: "manual", installments: [3, 6], autoCapture: true },
    });
    const settings = await paymentSettings();
    expect(settings.installments).toEqual([3, 6]);
    expect(settings.autoCapture).toBe(true);
  });

  it("reads secrets from the environment, never from the folder", async () => {
    // The tenant folder is handed over during support. A key written into it
    // travels with every one of those trips, so it is read from the process
    // environment instead — and a name that was never set stays undefined.
    process.env.PAYMENT_TESTPROV_API_KEY = "sk-test";
    expect(paymentSecret("testprov", "api_key")).toBe("sk-test");
    expect(paymentSecret("testprov", "missing")).toBeUndefined();
    delete process.env.PAYMENT_TESTPROV_API_KEY;

    // The parsed block carries only these three; anything a customer typed
    // into the file that looks like a credential is not carried anywhere.
    await writeConfig({
      ...BASE,
      payment: { provider: "manual", apiKey: "sk-should-be-dropped" },
    });
    const settings = await paymentSettings();
    expect(Object.keys(settings).sort()).toEqual([
      "autoCapture",
      "installments",
      "provider",
    ]);
  });
});
