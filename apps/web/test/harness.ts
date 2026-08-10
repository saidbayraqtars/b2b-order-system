import { NextRequest } from "next/server";
import { prisma } from "@repo/database";
import { defaultPermissionsFor, type Permission, type Role } from "@repo/types";
import { signMobileToken } from "@/lib/mobile-token";
import { runInRequestScope } from "./request-context";

// Everything a route test needs: a way to call a handler the way Next.js would,
// and fixtures to give it something to answer about.
//
// Calls carry a **real** bearer token by default — signed by the app's own
// signer, verified by the app's own verifier, resolved against a real row. That
// is the whole point: the interesting failures live in the seam between "the
// token said" and "the account is", and a faked principal would hide exactly
// those. The Auth.js cookie path is available too (`session:`), because the one
// thing worth proving about it is that its claims are *not* believed.

export const hasDb = Boolean(process.env.DATABASE_URL);

const BASE_URL = "http://localhost:3000";

// ─────────────────────────────────────────────
// calling a handler
// ─────────────────────────────────────────────

/**
 * A route handler as Next.js sees it: (request, { params }).
 *
 * Generic over the params shape so a handler declaring `{ params: { id: string } }`
 * still matches — under strictFunctionTypes a plain `Record<string, string>`
 * here would reject every dynamic route in the app.
 */
type RouteHandler<P> = (
  req: NextRequest,
  ctx: { params: P },
) => Promise<Response> | Response;

export interface CallOptions<P = Record<string, string>> {
  /** Path with query, e.g. `/api/orders?companyId=x`. */
  url?: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Serialized as JSON with the matching content-type. */
  body?: unknown;
  /** Bearer token — what the mobile app sends. */
  token?: string | null;
  /** Auth.js cookie session, for the paths that must not trust it. */
  session?: unknown;
  /** Dynamic segments: `{ id: "..." }` for `/api/orders/[id]`. */
  params?: P;
  /** Extra request headers (x-forwarded-for, user-agent, …). */
  headers?: Record<string, string>;
}

export interface CallResult<T = any> {
  status: number;
  body: T;
}

/**
 * Invoke a route handler inside a request scope and read its JSON answer.
 *
 * Handlers are wrapped in `withAuthErrors`, so a rejected guard comes back as a
 * Response rather than a thrown error — which is what makes it possible to
 * assert on the status code the browser would actually receive.
 */
export async function callRoute<
  T = any,
  P extends Record<string, string> = Record<string, string>,
>(
  handler: RouteHandler<P>,
  options: CallOptions<P> = {},
): Promise<CallResult<T>> {
  const {
    url = "/",
    method = "GET",
    body,
    token,
    session = null,
    params = {} as P,
    headers: extra = {},
  } = options;

  const headers = new Headers({
    "user-agent": "vitest-route-suite",
    ...extra,
  });
  if (token) headers.set("authorization", `Bearer ${token}`);

  const init: { method: string; headers: Headers; body?: string } = {
    method,
    headers,
  };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }

  const request = new NextRequest(new URL(url, BASE_URL), init);

  const response = await runInRequestScope({ headers, session }, () =>
    Promise.resolve(handler(request, { params })),
  );

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed as T };
}

// ─────────────────────────────────────────────
// credentials
// ─────────────────────────────────────────────

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  tokenVersion: number;
}

/** A signed bearer token for this account, as /api/mobile/login would issue. */
export function bearer(
  user: TestUser,
  overrides: { tokenVersion?: number } = {},
): Promise<string> {
  return signMobileToken(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      // Empty on purpose: the guard reads permissions from the row, never from
      // the token. A test that put them here would be testing the token.
      permissions: [],
    },
    overrides.tokenVersion ?? user.tokenVersion,
  );
}

/** What `auth()` returns for a cookie session — claims, nothing more. */
export function cookieSession(
  user: TestUser,
  overrides: Partial<TestUser> = {},
): { user: Record<string, unknown> } {
  const claimed = { ...user, ...overrides };
  return {
    user: {
      id: claimed.id,
      email: claimed.email,
      name: claimed.name,
      role: claimed.role,
      companyId: claimed.companyId,
      tokenVersion: claimed.tokenVersion,
    },
  };
}

// ─────────────────────────────────────────────
// fixtures
// ─────────────────────────────────────────────

/**
 * A fixture set scoped to one test file.
 *
 * Every row it creates is remembered so `teardown()` can remove it: the suites
 * share one database and a leftover company would show up in the next file's
 * list assertions.
 */
export class Fixtures {
  readonly tag: string;
  private readonly userIds: string[] = [];
  private readonly companyIds: string[] = [];
  private readonly groupIds: string[] = [];
  private readonly categoryIds: string[] = [];
  private readonly productIds: string[] = [];

  constructor(prefix: string) {
    this.tag = `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  }

  async user(
    role: Role,
    options: {
      permissions?: readonly Permission[] | null;
      companyId?: string | null;
      isActive?: boolean;
      label?: string;
    } = {},
  ): Promise<TestUser> {
    const label = options.label ?? role.toLowerCase();
    const row = await prisma.user.create({
      data: {
        email: `${label}-${this.tag}@test.local`,
        name: `${label} ${this.tag}`,
        passwordHash: "not-used-in-route-tests",
        role,
        isActive: options.isActive ?? true,
        companyId: options.companyId ?? null,
        // `null` means "strip every permission" — the case that proves a role
        // alone opens nothing. Omitted means the role's own template.
        permissions:
          options.permissions === null
            ? []
            : [...(options.permissions ?? defaultPermissionsFor(role))],
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        tokenVersion: true,
      },
    });
    this.userIds.push(row.id);
    return row as TestUser;
  }

  async group(name = "Grup"): Promise<string> {
    const row = await prisma.customerGroup.create({
      data: { name: `${name} ${this.tag}` },
    });
    this.groupIds.push(row.id);
    return row.id;
  }

  async company(options: {
    customerGroupId?: string;
    salesRepId?: string | null;
    creditLimit?: number;
    currentBalance?: number;
    requiresOrderApproval?: boolean;
    isActive?: boolean;
    label?: string;
  } = {}): Promise<string> {
    const row = await prisma.company.create({
      data: {
        name: `${options.label ?? "Firma"} ${this.tag}`,
        customerGroupId: options.customerGroupId,
        salesRepId: options.salesRepId ?? null,
        creditLimit: options.creditLimit ?? 1_000_000,
        currentBalance: options.currentBalance ?? 0,
        requiresOrderApproval: options.requiresOrderApproval ?? false,
        isActive: options.isActive ?? true,
      },
      select: { id: true },
    });
    this.companyIds.push(row.id);
    return row.id;
  }

  /**
   * One category, one product, one variant, one list price. Enough for an order
   * line; deliberately not a catalogue, so a failing assertion points at the
   * route rather than at fixture arithmetic.
   */
  async variant(options: {
    customerGroupId?: string | null;
    price?: number;
    stock?: number;
    moqUnits?: number;
    unitsPerCase?: number;
  } = {}): Promise<{ variantId: string; productId: string; categoryId: string }> {
    const category = await prisma.category.create({
      data: { name: `Kategori ${this.tag}`, slug: `kategori-${this.tag}` },
      select: { id: true },
    });
    this.categoryIds.push(category.id);

    const product = await prisma.product.create({
      data: {
        name: `Ürün ${this.tag}`,
        slug: `urun-${this.tag}`,
        categoryId: category.id,
        vatRate: 20,
        variants: {
          create: {
            sku: `SKU-${this.tag}`,
            stock: options.stock ?? 1_000,
            moqUnits: options.moqUnits ?? 1,
            unitsPerCase: options.unitsPerCase ?? 1,
          },
        },
      },
      select: { id: true, variants: { select: { id: true } } },
    });
    this.productIds.push(product.id);
    const variantId = product.variants[0]!.id;

    await prisma.price.create({
      data: {
        variantId,
        customerGroupId: options.customerGroupId ?? null,
        minQuantity: 1,
        price: options.price ?? 100,
      },
    });

    return { variantId, productId: product.id, categoryId: category.id };
  }

  /**
   * Remove everything this file created, children first. Written by hand rather
   * than leaning on cascades because the ledger rows and the audit trail hang
   * off users and companies without one.
   */
  async teardown(): Promise<void> {
    if (!hasDb) return;
    const companyId = { in: this.companyIds };
    const userId = { in: this.userIds };

    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
    await prisma.cartItem.deleteMany({ where: { cart: { companyId } } });
    await prisma.cart.deleteMany({ where: { companyId } });
    await prisma.checkIn.deleteMany({ where: { companyId } });
    await prisma.visitRequest.deleteMany({ where: { companyId } });
    await prisma.salesTarget.deleteMany({ where: { salesRepId: userId } });

    // The till rows point at the paper and the paper points back: a cheque
    // carries the movement that settled it, a card intent carries the movement
    // that banked it. Both have to go before the movements themselves.
    await prisma.chequeEvent.deleteMany({ where: { cheque: { companyId } } });
    await prisma.cheque.deleteMany({ where: { companyId } });
    await prisma.paymentIntentEvent.deleteMany({
      where: { intent: { companyId } },
    });
    await prisma.paymentIntent.deleteMany({ where: { companyId } });

    // A movement has no company of its own; it is reached through whoever
    // typed it or whatever it settled. Reversals and transfer legs reference
    // their sibling, so the pointing rows go in the first pass.
    const movements = {
      OR: [
        { recordedById: userId },
        { order: { companyId } },
        { transaction: { companyId } },
      ],
    };
    await prisma.cashMovement.deleteMany({
      where: {
        AND: [
          movements,
          { OR: [{ NOT: { reversalOfId: null } }, { NOT: { counterpartId: null } }] },
        ],
      },
    });
    await prisma.cashMovement.deleteMany({ where: movements });
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { companyId } } });
    await prisma.invoice.deleteMany({ where: { companyId } });
    await prisma.shipmentItem.deleteMany({
      where: { shipment: { order: { companyId } } },
    });
    await prisma.shipment.deleteMany({ where: { order: { companyId } } });
    await prisma.orderStatusHistory.deleteMany({ where: { order: { companyId } } });
    await prisma.orderItem.deleteMany({ where: { order: { companyId } } });
    await prisma.promotionRedemption.deleteMany({ where: { companyId } });
    await prisma.order.deleteMany({ where: { companyId } });
    await prisma.companyDiscount.deleteMany({ where: { companyId } });
    await prisma.address.deleteMany({ where: { companyId } });

    await prisma.user.updateMany({
      where: { companyId },
      data: { companyId: null },
    });
    await prisma.company.updateMany({
      where: { salesRepId: userId },
      data: { salesRepId: null },
    });
    await prisma.company.deleteMany({ where: { id: { in: this.companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: this.userIds } } });

    await prisma.price.deleteMany({
      where: { variant: { productId: { in: this.productIds } } },
    });
    await prisma.productVariant.deleteMany({
      where: { productId: { in: this.productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: this.productIds } } });
    await prisma.category.deleteMany({ where: { id: { in: this.categoryIds } } });
    await prisma.customerGroup.deleteMany({ where: { id: { in: this.groupIds } } });
  }
}
