import type { NextRequest } from "next/server";
import { createCheckIn, getOpenCheckIn, listCheckIns } from "@repo/services";
import { checkInSchema } from "@repo/types";
import {
  InputError,
  requestChannel,
  requireUser,
  withAuthErrors,
} from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

const FIELD_ROLES = ["SALES_REP", "SUPER_ADMIN"] as const;

// POST /api/checkins — open a field visit at a company in the rep's portfolio.
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(FIELD_ROLES);

    const json = await req.json().catch(() => null);
    const parsed = checkInSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    // Authorize the target company before the service trusts the id.
    const companyId = await resolveCompanyId(user, parsed.data.companyId);

    // Where the visit was recorded is decided here, from the credential the
    // request carried — a browser cannot claim to be the phone in the field.
    const channel = await requestChannel();

    const checkIn = await createCheckIn(
      { ...parsed.data, companyId, source: channel === "mobile" ? "MOBILE" : "WEB" },
      user.id,
    );
    return Response.json({ checkIn }, { status: 201 });
  });
}

// GET /api/checkins?companyId= — the caller's own recent visits, plus whichever
// one is still open (the screen's main action depends on it, and finding it by
// scanning the list would break as soon as the list is filtered or paged).
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(FIELD_ROLES);
    const { searchParams } = new URL(req.url);
    const requested = searchParams.get("companyId");

    const companyId = requested
      ? await resolveCompanyId(user, requested)
      : undefined;

    const [checkIns, open] = await Promise.all([
      listCheckIns(user.id, companyId),
      getOpenCheckIn(user.id),
    ]);
    return Response.json({ checkIns, open });
  });
}
