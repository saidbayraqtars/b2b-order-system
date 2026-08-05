# B2B Platform (Monorepo)

Turborepo + pnpm. Backend = Next.js Route Handlers (in `apps/web`), consumed by the Expo mobile app.

## Layout

```
apps/
  web/        Next.js App Router — Admin panel + B2B portal + API
  mobile/     Expo React Native — Plasiyer + Müşteri app
packages/
  database/       Prisma schema, client singleton, seed
  types/          Zod schemas + inferred TS types (edge-safe single source)
  auth/           Auth.js v5 edge-safe config + RBAC helpers
  services/       Domain layer — pricing, orders, documents, ledger, promotions,
                  cart, reports, mail, admin, security
  eslint-config/  Shared ESLint presets (base / next / react-native)
  tsconfig/       Shared TS base configs
```

**`FEATURES.md` is the feature inventory** — what actually works today, the design
decisions behind each area, and the known gaps. Start there.

## Bootstrap

```bash
# 1) Enable pnpm (Node 20/22 recommended; Node 24 works but is untested by Expo SDK 51)
corepack enable
corepack prepare pnpm@9.12.2 --activate

# 2) Install
pnpm install

# 3) Env — copy examples and fill in
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env
cp apps/mobile/.env.example apps/mobile/.env
#   Generate an auth secret:
cd apps/web && npx auth secret && cd ../..
#   Leave SMTP_HOST empty for local work: mail is printed to the log, not sent.
#   UPLOAD_DIR defaults to ./uploads — product images are written there, not into public/.

# 4) Postgres (Docker) — host port 5433, so it can't collide with a local 5432
docker compose up -d

# 5) Database
pnpm db:generate        # prisma generate
pnpm db:migrate         # apply migrations
pnpm db:seed            # seed admin + demo data (idempotent, safe to re-run)

# 6) Run
pnpm --filter web dev       # web on http://localhost:3000
pnpm --filter mobile start  # expo
```

## Verification

```bash
pnpm typecheck   # tsc across every package
pnpm lint        # ESLint, zero-warning budget
pnpm test        # Vitest: unit suite + integration suite
pnpm build       # next build + package builds
```

`pnpm test` runs two suites, 151 tests over 11 files today. The unit suite (70) is pure
domain maths and needs nothing. The integration suite (81) talks to a real Postgres,
builds its own fixture (group, company, product, price tiers, campaigns, document series)
and touches only its own rows — so it is safe against a database that already has seed
data. Without `DATABASE_URL` it is skipped rather than failed. CI
(`.github/workflows/ci.yml`) runs all four commands against a Postgres service container.

One fixture is worth knowing about: a test that asserts on document numbers must call
`useOwnDefaultSeries()`, because a series only issues numbers while it is the *default*
one. Creating a series and forgetting to promote it leaves the test drawing from the
seeded counter, which passes exactly once — on a database where that counter is still
zero.

## Seed accounts (password: `Password123!`)

| Email                | Role          |
| -------------------- | ------------- |
| admin@b2b.local      | SUPER_ADMIN   |
| rep@b2b.local        | SALES_REP     |
| manager@ornek.local  | COMPANY_ADMIN |
| staff@ornek.local    | COMPANY_STAFF |

## RBAC route map

Source of truth: `packages/auth/src/rbac.ts`.

| Prefix       | Allowed roles                                      |
| ------------ | -------------------------------------------------- |
| `/admin`     | SUPER_ADMIN                                        |
| `/rep`       | SALES_REP, SUPER_ADMIN                             |
| `/portal`    | COMPANY_ADMIN, COMPANY_STAFF, SUPER_ADMIN          |
| `/reports`   | SUPER_ADMIN, SALES_REP, COMPANY_ADMIN              |
| `/orders`    | all four (rows scoped server-side)                 |
| `/documents` | all four (document authorized against its company) |
| `/hesabim`   | all four (own account only)                        |

## Authorization model

Three layers, and the order matters:

1. **Edge `middleware.ts`** — role check from the signed cookie, redirects to
   `/login` or `/403`. A *pre-filter*: the edge runtime has no database access.
2. **`requirePage()`** — Server Components. Redirects.
3. **`requireUser()`** — route handlers. Returns JSON 401/403.

Both (2) and (3) go through `apps/web/src/lib/guard.ts`, which **re-reads the account
from the database on every request**. A session token proves someone logged in once —
not that the account still exists, is still enabled, or still has that role. Role and
`companyId` used in a decision come from the database row, never from the token claims.

`User.tokenVersion` is bumped whenever role, company, active flag or password changes,
which invalidates every session already issued to that account — web cookie and 30-day
mobile bearer token alike. Rejected sessions and denied requests land in the audit log
(`/admin/audit`).

API routes are deliberately absent from the middleware map: they are guarded by
`requireUser()` so they answer with JSON instead of an HTML redirect, which is what the
mobile client needs.

## Pricing a cart

One calculation, used twice. `buildQuote()` in `packages/services/src/order-quote.ts`
validates the lines (MOQ, case multiple, stock), resolves the company's group price and
discount, runs the promotion engine and totals it up. `POST /api/orders/quote` returns
that to the portal; `createOrder()` runs the very same function inside its transaction
before writing the snapshot. The browser never computes a total, and the server never
trusts one it was handed — a preview and an order cannot disagree, and a stale preview
cannot lock in a price that has since moved.

## Documents, and the ERP next door

This system is meant to run beside an ERP (VegaWin A5 / VegaDB and the like), so
numbering is a row rather than a constant: `DocumentSeries` holds the prefix,
width and last number issued for waybills and invoices. Allocation is one
`UPDATE ... RETURNING` inside the caller's transaction, so two despatches racing
for the next number queue behind a row lock instead of both reading the same
value. A cancelled document keeps its number. Mark a serial `externalOnly` and
the app stops inventing numbers altogether — it then demands the ERP's, and
leaves its own counter untouched.

Fulfilment is quantity-based, not order-based. `Shipment`/`ShipmentItem` record
what actually left, `OrderItem.quantityShipped` tracks what is outstanding, and
the order's status is *derived* from that — PROCESSING while anything remains,
SHIPPED when nothing does. Invoices bill quantities the same way, either from
selected despatches or from whatever is left. They never recompute money: prices
and the campaign allocation were frozen on the order line, so an invoice takes a
proportional share and the one that closes a line takes the rounding remainder,
which keeps the invoices of an order summing exactly back to it.

The vade starts with the invoice. The cari debit is still written when the order
is confirmed (that is what the credit limit meters) but with no due date; the
first invoice stamps one, later invoices only push it out. Aging buckets by that
date, falling back to order date + the company's term for debts not yet invoiced.

## Promotions as data

A campaign is a row: a list of conditions that must all hold, and a list of actions that
produce the discount, both stored as `{ type, params }` JSON. The catalogue of rule types
lives in `packages/services/src/promotion-registry.ts`, which is also the **security
boundary** — an unknown type does not exist, and every parameter is parsed by the Zod
schema declared next to its rule, on write *and* on every evaluation. Nothing from a
client (or from a row edited straight in the database) is ever run as code.

`promotion-engine.ts` is pure: it takes priced lines plus compiled rules and returns the
per-line allocation. Campaigns run in priority order, each seeing what the previous one
left, and VAT is charged on the net after promotions. Usage caps count redemption rows
whose order is still alive, so a cancellation returns the quota while the order keeps its
record of what it was granted.

### Where a campaign discount lands

Three places, and they are kept apart on purpose. Line discounts go into
`promotionTotal`, which always equals the sum of the lines — invoicing splits that
figure across them, so nothing else may hide in it. A freight discount is taken off
`shippingFee` at source and recorded in `shippingDiscount`; it takes no part in the grand
total, because subtracting it again would discount the delivery twice. A gift is a line
carrying its own list value and an equal discount, so it nets to zero without pretending
the goods were worthless — which is what an invoice has to show.

The engine reports all three separately and never prices anything: it knows *what* to give
and *how many*, and `buildQuote` values it against the catalogue. A gift that cannot be
given — out of stock, or no price this company could be charged — is skipped, not fatal. A
campaign misconfigured months ago must not block today's checkout.

## Mail without a mail server

Leave `SMTP_HOST` empty and every message is printed to the server log instead of being
sent — including the password-reset link, which is how you walk `/sifremi-unuttum` end to
end locally with no mail account. Set `SMTP_HOST` and the same code sends over SMTP; there
is no flag to remember and no separate "dev mode" path to drift out of sync.

Sending never throws at the caller: a notification announces work that is already
committed, so a dead mail server must not roll back the order it was announcing. Each
attempt lands in the audit trail as `NOTIFICATION_SENT` or `NOTIFICATION_FAILED`.

The reset flow stores only the SHA-256 of its token, expires it in 60 minutes, spends it
once, and answers identically whether or not the address belongs to an account — anything
else would turn the form into a customer-list oracle.

## The cart is a row, not a browser tab

One `Cart` per (company, owner). It stores what the person chose — variant and quantity —
and nothing about money: price, campaign and VAT are resolved every time it is read, so a
cart cannot quietly hold last week's price. MOQ, case multiples and stock are *not*
enforced here; a cart is a draft, and those rules already stop an invalid order at the
quote and at checkout. Placing an order empties the cart server-side, so a second tab
cannot replay it.

Uploaded images land in `UPLOAD_DIR` and come back through `/api/media/...`, never out of
`public/` — that directory is a build input, and writing into it at runtime stops working
the moment the app is containerised. The upload path trusts the bytes, not the name: only
files carrying a real image signature are accepted, and the stored name is random, so
there is no path to traverse and no URL to guess.

## Reports are a registry, not a query language

A saved report is user data: it arrives over HTTP, it is stored as JSON, and it
can be edited straight in the database. So no name in it ever reaches the
database. A field is resolved through the dataset registry first, and what comes
out is a definition *we* wrote — its path, its type, what may be aggregated, and
which relations it travels through.

Aggregation runs as `GROUP BY` in Postgres, which is why there is no longer a
row-scan cap: the database returns one row per group however many it read. That
requires building SQL by hand, and it is safe here for one reason — every
identifier in the statement comes from the registry, and every value travels as
a bound parameter. A field that is not in the registry does not exist, so there
is no route from input to an identifier.

The row scope is written once, as a Prisma filter, and translated for the SQL
path. Two scope declarations would be a hole waiting for the day someone pressed
"group by"; the integration tests check that a sales rep grouping a report still
sees only their own portfolio.

Users cannot write their own joins, on purpose. Relations are declared in the
registry and surfaced as fields grouped by source table, so the builder offers
"Firma → Müşteri grubu" without anyone composing a query. Adding a relation is
one line there, and the UI picks it up on its own.

## Caching an authorization input

`loadPrincipal` sits behind a five-second, in-process cache. That is caching an
input to an access decision, so the design is deliberately narrow: the cache
stores the account row and never a verdict — `checkPrincipal` still decides on
every request — and every write that changes what an account may do evicts the
entry *after* the write lands, so a revocation bites on the next request rather
than at the end of the TTL. Evicting before the write would let a concurrent
read repopulate the cache from the row about to be replaced.

The remaining exposure is stated rather than hidden: across several processes an
eviction in one does not reach the others, so a revocation can take up to the
TTL to be seen elsewhere. Behind a load balancer that matters, the fix is a
shared eviction signal — not a longer TTL.

Account lockout counts per e-mail, which is exactly what password spraying
avoids: one attempt against each of a hundred addresses trips nothing. So failed
logins are also counted per source address, using the audit log itself as the
counter rather than a second table free to disagree with the one an auditor
reads. `x-forwarded-for` is client-controlled unless a trusted proxy overwrites
it, so this raises the cost of spraying; it is not access control, and nothing
in it decides authorization.
