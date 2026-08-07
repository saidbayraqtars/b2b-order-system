-- Çek/senet portföyü.
--
-- Kâğıt tahsilattan doğuyor (`Cheque.transactionId` zorunlu ve tekil): cariyi
-- kapatmamış bir çek satırı ya da bir tahsilattan iki kâğıt oluşamaz.
-- `ChequeEvent` yolu tutuyor — durum kolonu yalnızca son hâli söyler, ihtilafta
-- gereken şey "ne zaman tahsile verildi, kim karşılıksız işaretledi".

-- CreateEnum
CREATE TYPE "ChequeKind" AS ENUM ('CHEQUE', 'PROMISSORY_NOTE');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PORTFOLIO', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'ENDORSED', 'RETURNED', 'CANCELLED');


-- CreateTable
CREATE TABLE "Cheque" (
    "id" TEXT NOT NULL,
    "kind" "ChequeKind" NOT NULL DEFAULT 'CHEQUE',
    "status" "ChequeStatus" NOT NULL DEFAULT 'PORTFOLIO',
    "companyId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "serialNumber" TEXT,
    "bankName" TEXT,
    "branchName" TEXT,
    "drawerName" TEXT,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "cashAccountId" TEXT,
    "cashMovementId" TEXT,
    "endorsedTo" TEXT,
    "reopenTransactionId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChequeEvent" (
    "id" TEXT NOT NULL,
    "chequeId" TEXT NOT NULL,
    "fromStatus" "ChequeStatus",
    "toStatus" "ChequeStatus" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChequeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_transactionId_key" ON "Cheque"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_cashMovementId_key" ON "Cheque"("cashMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_reopenTransactionId_key" ON "Cheque"("reopenTransactionId");

-- CreateIndex
CREATE INDEX "Cheque_status_dueDate_idx" ON "Cheque"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Cheque_companyId_status_idx" ON "Cheque"("companyId", "status");

-- CreateIndex
CREATE INDEX "Cheque_dueDate_idx" ON "Cheque"("dueDate");

-- CreateIndex
CREATE INDEX "ChequeEvent_chequeId_occurredAt_idx" ON "ChequeEvent"("chequeId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeEvent" ADD CONSTRAINT "ChequeEvent_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "Cheque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeEvent" ADD CONSTRAINT "ChequeEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
