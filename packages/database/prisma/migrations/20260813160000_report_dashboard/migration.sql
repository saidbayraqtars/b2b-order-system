-- Boards of saved reports. Tiles point at ReportDefinition rows rather than
-- copying their config, so a report edited once is edited everywhere it shows.
CREATE TABLE "ReportDashboard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "tiles" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDashboard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportDashboard_ownerId_idx" ON "ReportDashboard"("ownerId");

ALTER TABLE "ReportDashboard" ADD CONSTRAINT "ReportDashboard_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
