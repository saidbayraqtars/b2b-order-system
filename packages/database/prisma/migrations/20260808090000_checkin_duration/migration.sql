-- Visit duration, stored at check-out.
--
-- Backfilled for the visits that are already closed: the value is derivable
-- today, and leaving history null would make the first month of the new visit
-- report look like nobody worked.
ALTER TABLE "CheckIn" ADD COLUMN "durationMinutes" INTEGER;

UPDATE "CheckIn"
SET "durationMinutes" = GREATEST(
  0,
  FLOOR(EXTRACT(EPOCH FROM ("checkOutAt" - "checkInAt")) / 60)::int
)
WHERE "checkOutAt" IS NOT NULL;
