-- CreateEnum
CREATE TYPE "AnnouncementPlacement" AS ENUM ('TICKER', 'BANNER', 'MODAL');

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "placement" "AnnouncementPlacement" NOT NULL DEFAULT 'BANNER',
    "tone" TEXT NOT NULL DEFAULT 'brand',
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "customerGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_enabled_placement_priority_idx" ON "Announcement"("enabled", "placement", "priority");
