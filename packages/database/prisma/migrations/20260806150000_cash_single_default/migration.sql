-- Exactly one default cash account.
--
-- `isDefault` decides where an unbound payment method's money lands. Two rows
-- carrying it would make that answer depend on row order, which is not a thing
-- a ledger may depend on.
--
-- Prisma cannot express a partial unique index, so this is hand-written and
-- lives in its own migration — the same treatment
-- `Price_variant_default_tier_key` gets.
CREATE UNIQUE INDEX "CashAccount_single_default_key"
  ON "CashAccount" ("isDefault")
  WHERE "isDefault" = true;
