# B2B Platform (Monorepo)

Turborepo + pnpm. Backend = Next.js Route Handlers (in `apps/web`), consumed by the Expo mobile app.

## Layout

```
apps/
  web/        Next.js App Router — Admin panel + B2B portal + API
  mobile/     Expo React Native — Plasiyer + Müşteri app
packages/
  database/   Prisma schema, client singleton, seed
  types/      Zod schemas + inferred TS types (edge-safe single source)
  auth/       Auth.js v5 edge-safe config + RBAC helpers
  services/   Domain layer — pricing, orders, ledger, reports, admin, security
  tsconfig/   Shared TS base configs
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

> No test suite yet, and ESLint is not configured — `pnpm lint` fails. Verification
> so far is `pnpm typecheck`, `next build`, `expo export` and manual E2E scripts.

## Seed accounts (password: `Password123!`)

| Email                | Role          |
| -------------------- | ------------- |
| admin@b2b.local      | SUPER_ADMIN   |
| rep@b2b.local        | SALES_REP     |
| manager@ornek.local  | COMPANY_ADMIN |
| staff@ornek.local    | COMPANY_STAFF |

## RBAC route map

Source of truth: `packages/auth/src/rbac.ts`.

| Prefix     | Allowed roles                                        |
| ---------- | ---------------------------------------------------- |
| `/admin`   | SUPER_ADMIN                                          |
| `/rep`     | SALES_REP, SUPER_ADMIN                               |
| `/portal`  | COMPANY_ADMIN, COMPANY_STAFF, SUPER_ADMIN            |
| `/reports` | SUPER_ADMIN, SALES_REP, COMPANY_ADMIN                |
| `/orders`  | all four (rows scoped server-side)                   |
| `/hesabim` | all four (own account only)                          |

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
