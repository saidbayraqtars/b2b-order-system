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
  tsconfig/   Shared TS base configs
```

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

# 4) Database
pnpm db:generate        # prisma generate
pnpm db:migrate         # create + apply first migration
pnpm db:seed            # seed admin + demo data

# 5) Run
pnpm --filter web dev       # web on http://localhost:3000
pnpm --filter mobile start  # expo
```

## Seed accounts (password: `Password123!`)

| Email                | Role          |
| -------------------- | ------------- |
| admin@b2b.local      | SUPER_ADMIN   |
| rep@b2b.local        | SALES_REP     |
| manager@ornek.local  | COMPANY_ADMIN |
| staff@ornek.local    | COMPANY_STAFF |

## RBAC route map

| Prefix   | Allowed roles                             |
| -------- | ----------------------------------------- |
| `/admin` | SUPER_ADMIN                               |
| `/rep`   | SALES_REP, SUPER_ADMIN                    |
| `/portal`| COMPANY_ADMIN, COMPANY_STAFF, SUPER_ADMIN |

Gated in two layers: edge `middleware.ts` (redirect) + server `requireUser()` in `apps/web/src/lib/guard.ts` (defense in depth).
