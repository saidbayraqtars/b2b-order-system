-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'AUDIT_PURGED';
ALTER TYPE "AuditAction" ADD VALUE 'AUDIT_EXPORTED';

-- CreateIndex
-- The login throttle counts failed attempts per source address inside a window.
-- Without this index that count is a sequential scan of the whole trail, on the
-- one request path that must stay fast under attack.
CREATE INDEX "AuditLog_ip_action_createdAt_idx" ON "AuditLog"("ip", "action", "createdAt");
