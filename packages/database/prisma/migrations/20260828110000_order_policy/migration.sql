-- Sipariş kabul kuralları: asgari tutar/koli, sevkiyat kesim saati, kanal.
--
-- Yalnızca ekliyor. Var olan siparişler `WEB` sayılıyor — mobil uygulama
-- kanalı ayırmadan önce girilen her sipariş tarayıcıdan geldi ve bu doğru.

CREATE TYPE "OrderSource" AS ENUM ('WEB', 'MOBILE');

ALTER TABLE "Order" ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'WEB';

ALTER TABLE "Company" ADD COLUMN "minOrderAmount" DECIMAL(14,2);

CREATE TABLE "OrderPolicy" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "minOrderAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minOrderCases" INTEGER NOT NULL DEFAULT 0,
    "cutoffHour" INTEGER,
    "shipsOnSaturday" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "OrderPolicy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderPolicy" ADD CONSTRAINT "OrderPolicy_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
