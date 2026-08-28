import type { NextRequest } from "next/server";
import { globalSearch } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

const ALL_ROLES = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
  "COURIER",
] as const;

// GET /api/search?q= — the box behind Ctrl+K.
//
// No permission of its own: every role may search, and what comes back is
// decided per kind inside globalSearch from the caller's own permissions and
// portfolio. A single "search.use" permission would have been the wrong shape —
// it would either open all three kinds or none.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(ALL_ROLES);
    const q = new URL(req.url).searchParams.get("q") ?? "";

    const hits = await globalSearch(q, {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
      permissions: user.permissions,
    });
    return Response.json({ hits });
  });
}
