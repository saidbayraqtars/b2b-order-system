import type { ReportScope } from "@repo/services";
import type { ReportQueryInput, SessionUser } from "@repo/types";

/**
 * Turn a validated report query into a scope the caller is actually allowed to
 * see. A SALES_REP is always pinned to their own id, so passing someone else's
 * `salesRepId` narrows to an empty intersection rather than widening access.
 * A SUPER_ADMIN gets whatever was asked for.
 */
export function reportScopeFor(
  user: SessionUser,
  query: ReportQueryInput,
): ReportScope {
  if (user.role === "SALES_REP") {
    return { ...query, salesRepId: user.id };
  }
  return query;
}
