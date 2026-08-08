-- Scheduled report delivery.
--
-- The schedule hangs off the definition: one per report, deleted with it.
ALTER TABLE "ReportDefinition"
  ADD COLUMN "scheduleIntervalMinutes" INTEGER,
  ADD COLUMN "scheduleRecipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "scheduleNextRunAt" TIMESTAMP(3),
  ADD COLUMN "scheduleLastRunAt" TIMESTAMP(3),
  ADD COLUMN "scheduleLastStatus" TEXT,
  ADD COLUMN "scheduleLastSummary" TEXT;

-- The delivery job's only query: which reports are due. Partial would be
-- tempting, but Prisma writes plain indexes and a divergent schema is worse
-- than an index that also holds the unscheduled rows.
CREATE INDEX "ReportDefinition_scheduleNextRunAt_idx"
  ON "ReportDefinition"("scheduleNextRunAt");
