import type { AuditContext } from "@repo/services";
import type { SessionUser } from "@repo/types";
import { requestMeta } from "./request-meta";

/**
 * Identity recorded against everything a request writes.
 * Built from the live principal returned by requireUser — never from the body,
 * so a request cannot claim to be someone else in the log.
 */
export function auditContext(
  user: SessionUser,
  channel: "web" | "mobile" = "web",
): AuditContext {
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    meta: requestMeta(channel),
  };
}
