import type { NextRequest } from "next/server";
import { createCheckIn, listCheckIns } from "@repo/services";
import { checkInSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
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

    const checkIn = await createCheckIn({ ...parsed.data, companyId }, user.id);
    return Response.json({ checkIn }, { status: 201 });
  });
}

// GET /api/checkins?companyId= — the caller's own recent visits.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(FIELD_ROLES);
    const { searchParams } = new URL(req.url);
    const requested = searchParams.get("companyId");

    const companyId = requested
      ? await resolveCompanyId(user, requested)
      : undefined;

    const checkIns = await listCheckIns(user.id, companyId);
    return Response.json({ checkIns });
  });
}
