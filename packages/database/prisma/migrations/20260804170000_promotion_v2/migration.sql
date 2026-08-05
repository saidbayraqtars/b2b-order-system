-- CreateEnum
CREATE TYPE "ConditionMode" AS ENUM ('ALL', 'ANY');

-- AlterTable
-- Existing lines were all paid for; false is the honest default.
ALTER TABLE "OrderItem" ADD COLUMN     "isGift" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
-- Existing campaigns joined their conditions with AND, so ALL preserves them.
ALTER TABLE "Promotion" ADD COLUMN     "conditionMode" "ConditionMode" NOT NULL DEFAULT 'ALL';
