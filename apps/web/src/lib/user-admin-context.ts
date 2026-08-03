import type { UserAdminContext } from "@repo/services";
import type { Role, SessionUser } from "@repo/types";

/** Roles allowed to reach the user-administration endpoints at all. */
export const USER_ADMIN_ROLES: readonly Role[] = ["SUPER_ADMIN", "COMPANY_ADMIN"];

/**
 * Identity the user-admin service applies its rules against. Taken from the
 * session only — a caller must never be able to name the company or role they
 * are acting as.
 */
export function userAdminContext(user: SessionUser): UserAdminContext {
  return { userId: user.id, role: user.role, companyId: user.companyId };
}
