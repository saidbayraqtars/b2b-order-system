-- Ödeme niyeti: sanal POS / ödeme sağlayıcı bağlantı noktası.
--
-- Adım 27 kart siparişinin bedelini POS hesabına yazıyordu, ama kimse kartı
-- çekmiyordu — elimizde olmayan paranın kaydı. PaymentIntent eksik adım:
-- sipariş onaylanır, niyet açılır, kasa yalnızca **tahsilat gerçekleşince**
-- haberdar olur.
--
-- `provider` bilerek enum değil, düz metin: hangi sağlayıcıların var olduğu
-- kurulumun özelliğidir, müşteri başına migration gerektirmemeli.

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "orderId" TEXT,
    "companyId" TEXT NOT NULL,
    "providerRef" TEXT,
    "redirectUrl" TEXT,
    "failureReason" TEXT,
    "cashMovementId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one till entry per intent — a capture cannot be booked twice.
CREATE UNIQUE INDEX "PaymentIntent_cashMovementId_key" ON "PaymentIntent"("cashMovementId");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_createdAt_idx" ON "PaymentIntent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_orderId_idx" ON "PaymentIntent"("orderId");

-- CreateIndex
CREATE INDEX "PaymentIntent_companyId_createdAt_idx" ON "PaymentIntent"("companyId", "createdAt");

-- CreateIndex: reconciliation against the provider's own panel reads this.
CREATE INDEX "PaymentIntent_provider_providerRef_idx" ON "PaymentIntent"("provider", "providerRef");

-- CreateTable
CREATE TABLE "PaymentIntentEvent" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL,
    "note" TEXT,
    "payload" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentIntentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentIntentEvent_intentId_createdAt_idx" ON "PaymentIntentEvent"("intentId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_cashMovementId_fkey" FOREIGN KEY ("cashMovementId") REFERENCES "CashMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntentEvent" ADD CONSTRAINT "PaymentIntentEvent_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntentEvent" ADD CONSTRAINT "PaymentIntentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
