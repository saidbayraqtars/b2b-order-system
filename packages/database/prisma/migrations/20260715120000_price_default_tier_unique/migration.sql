-- Enforce a single DEFAULT (null customer group) price per variant + quantity tier.
-- Postgres treats NULLs as distinct in a plain UNIQUE, so the schema-level
-- @@unique([variantId, customerGroupId, minQuantity]) does NOT prevent duplicate
-- default-price rows. This partial unique index closes that gap.
CREATE UNIQUE INDEX "Price_variant_default_tier_key"
  ON "Price" ("variantId", "minQuantity")
  WHERE "customerGroupId" IS NULL;
