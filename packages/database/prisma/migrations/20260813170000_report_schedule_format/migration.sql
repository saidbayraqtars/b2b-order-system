-- Scheduled reports can be mailed as a spreadsheet instead of a CSV.
-- Existing schedules keep sending exactly what they sent yesterday.
ALTER TABLE "ReportDefinition"
    ADD COLUMN "scheduleFormat" TEXT NOT NULL DEFAULT 'CSV';
