import type { ReportContext } from "@repo/services";
import type { Role, SessionUser } from "@repo/types";

/** Roles allowed to build and run user-defined reports. */
export const REPORT_BUILDER_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "SALES_REP",
  "COMPANY_ADMIN",
];

/**
 * The identity the report engine scopes rows by. Always derived from the
 * session — never from the request body — so the caller cannot report as
 * someone else.
 */
export function reportContext(user: SessionUser): ReportContext {
  return { userId: user.id, role: user.role, companyId: user.companyId };
}
