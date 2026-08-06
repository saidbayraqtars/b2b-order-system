import type { PaymentIntentStatus } from "@repo/types";
import { BusinessError } from "./errors";
import type { Money } from "./money";

/**
 * The catalogue of ways money can be taken from a card.
 *
 * Which provider a customer uses is a property of their installation — one runs
 * iyzico, the next has a bank VPOS its manager negotiated, a third swipes a
 * physical terminal on the counter and types the result in. Hard-coding any of
 * them would make the next one a rewrite, so this file is a registry in the
 * same shape as `promotion-registry` and `report-registry`: the order pipeline
 * knows the interface and nothing else.
 *
 * It is also the security boundary of the payment path, and it has one rule
 * that is not negotiable:
 *
 *   **Card data never enters this system.** No PAN, no CVV, no expiry, not in a
 *   parameter, not in a log, not in `PaymentIntentEvent.payload`. Every
 *   provider worth integrating collects those on its own hosted page or in its
 *   own iframe, and that is why `authorize()` returns a URL to send the
 *   customer to rather than accepting a card number. A provider that needed the
 *   number would put this installation inside PCI-DSS scope, which is not a
 *   thing a wholesale ordering system should ever be inside of.
 *
 * Secrets do not live in the tenant folder either — see `paymentSettings()` in
 * tenant.ts. That folder is the unit of support: it is handed over, e-mailed
 * and copied. An API key in it travels with every one of those trips.
 */

// ─────────────────────────────────────────────
// WHAT A PROVIDER IS ASKED
// ─────────────────────────────────────────────

export interface AuthorizeInput {
  intentId: string;
  amount: Money;
  currency: string;
  installmentCount: number;
  /** For the provider's own records and its panel's search box. */
  orderNumber: string | null;
  companyName: string;
  /** Where the provider should send the customer back to after 3-D Secure. */
  returnUrl: string;
}

export interface AuthorizeResult {
  /** What the intent becomes. `PENDING` + a redirect means "customer is at the bank". */
  status: Extract<PaymentIntentStatus, "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED">;
  /** The provider's own id, so a human can find this row in its panel. */
  providerRef?: string;
  /** Where to send the customer, when the provider wants to talk to them. */
  redirectUrl?: string;
  failureReason?: string;
  /** Anything worth keeping for the argument later. Card data must not be here. */
  payload?: Record<string, unknown>;
}

export interface CaptureResult {
  status: Extract<PaymentIntentStatus, "CAPTURED" | "FAILED">;
  providerRef?: string;
  failureReason?: string;
  payload?: Record<string, unknown>;
}

export interface RefundResult {
  status: Extract<PaymentIntentStatus, "REFUNDED" | "FAILED">;
  failureReason?: string;
  payload?: Record<string, unknown>;
}

/** What a 3-D Secure return or a webhook turned out to mean. */
export interface ProviderCallbackResult {
  intentId: string;
  status: PaymentIntentStatus;
  providerRef?: string;
  failureReason?: string;
  payload?: Record<string, unknown>;
}

export interface ProviderCapabilities {
  /** Sends the customer to the bank before the money moves. */
  threeDS: boolean;
  /** Taksit — and if so, which counts the provider will accept. */
  installments: readonly number[];
  refund: boolean;
  /** Posts back asynchronously; `verifyWebhook` must then be implemented. */
  webhook: boolean;
  /**
   * True when nothing external is called and a human decides the outcome.
   * The kasa screen reads this to know whether to offer an "onayla" button:
   * confirming a real provider's charge by hand would be inventing money.
   */
  manual: boolean;
}

export interface PaymentProvider {
  /** Registry key, as written in tenant.json. */
  key: string;
  label: string;
  capabilities: ProviderCapabilities;

  /**
   * Open the charge. Returns where the intent landed — captured outright, held,
   * waiting for the customer at their bank, or refused.
   */
  authorize(input: AuthorizeInput): Promise<AuthorizeResult>;

  /** Take money that was only held. Absent when the provider captures outright. */
  capture?(input: { intentId: string; providerRef: string | null; amount: Money }): Promise<CaptureResult>;

  refund?(input: { intentId: string; providerRef: string | null; amount: Money }): Promise<RefundResult>;

  /** Read the customer's return from 3-D Secure. */
  complete3DS?(payload: Record<string, unknown>): Promise<ProviderCallbackResult>;

  /**
   * Verify a webhook and say what it meant.
   *
   * Takes the raw body, not a parsed object: every provider signs the exact
   * bytes it sent, and re-serialising JSON changes them. A provider that cannot
   * verify a signature must return null rather than trusting the body —
   * an unauthenticated webhook is an endpoint that lets a stranger mark orders
   * as paid.
   */
  verifyWebhook?(
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<ProviderCallbackResult | null>;
}

// ─────────────────────────────────────────────
// THE REGISTRY
// ─────────────────────────────────────────────

const PROVIDERS = new Map<string, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider): void {
  PROVIDERS.set(provider.key, provider);
}

export function listPaymentProviders(): PaymentProvider[] {
  return [...PROVIDERS.values()];
}

export function findPaymentProvider(key: string): PaymentProvider | null {
  return PROVIDERS.get(key) ?? null;
}

/**
 * The provider this installation runs, or a clear refusal.
 *
 * Refusing is the point. A missing provider used to mean "book the money
 * anyway"; now it means the card charge cannot be opened, and the operator is
 * told which key they wrote and which ones exist.
 */
export function requirePaymentProvider(key: string): PaymentProvider {
  const provider = PROVIDERS.get(key);
  if (!provider) {
    throw new BusinessError(
      "PAYMENT_PROVIDER_UNKNOWN",
      `Tanımsız ödeme sağlayıcısı: ${key}. Tanımlı olanlar: ${[...PROVIDERS.keys()].join(", ")}`,
      { key, known: [...PROVIDERS.keys()] },
    );
  }
  return provider;
}

// ─────────────────────────────────────────────
// BUILT-IN: ELDEN POS
// ─────────────────────────────────────────────

/**
 * The provider for installations that have no integration — which, on day one,
 * is all of them.
 *
 * It calls nothing. The order opens an intent, the intent sits in the kasa
 * screen's "bekleyen kart tahsilatları" list, and someone who has just swiped
 * the card on the terminal by the till presses onayla. Only then does the money
 * enter the ledger.
 *
 * This is not a placeholder for a real provider — it is how a shop with a bank
 * terminal on the counter actually works, and it is honest in a way the
 * previous behaviour was not: the money appears when a human says it did,
 * rather than because an order was saved.
 */
export const manualPaymentProvider: PaymentProvider = {
  key: "manual",
  label: "Elden POS (manuel onay)",
  capabilities: {
    threeDS: false,
    // The terminal handles taksit; the system only records what was agreed.
    installments: [1, 2, 3, 6, 9, 12],
    refund: true,
    webhook: false,
    manual: true,
  },

  authorize() {
    // Nothing to call. The charge happens on a device this system cannot see,
    // so the intent waits for the human who operated it.
    return Promise.resolve({
      status: "PENDING" as const,
      payload: { note: "Manuel onay bekleniyor" },
    });
  },

  capture(input) {
    return Promise.resolve({
      status: "CAPTURED" as const,
      providerRef: input.providerRef ?? undefined,
      payload: { note: "Operatör tarafından onaylandı" },
    });
  },

  refund() {
    // The refund happens on the terminal too; this only records it.
    return Promise.resolve({
      status: "REFUNDED" as const,
      payload: { note: "Operatör tarafından iade edildi" },
    });
  },
};

registerPaymentProvider(manualPaymentProvider);

/** Public shape of a provider for the admin screen. */
export interface PaymentProviderInfo {
  key: string;
  label: string;
  capabilities: ProviderCapabilities;
  /** True for the one this installation is configured to use. */
  active: boolean;
}

export function paymentProviderCatalog(activeKey: string): PaymentProviderInfo[] {
  return listPaymentProviders().map((p) => ({
    key: p.key,
    label: p.label,
    capabilities: p.capabilities,
    active: p.key === activeKey,
  }));
}
